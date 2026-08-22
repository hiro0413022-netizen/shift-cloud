-- ============================================================
-- 0119: FRANK会員 ⇄ レッスンカルテ の自動同期＋トラックマン計測の受け口
--
-- 背景（2026-08-22 ユーザー依頼）:
--   (1) FRANKで会員登録されたら Lesson OS のカルテも自動で増やしてほしい
--   (2) 退会したらレッスンOSの一覧から消えてほしい
--
-- なぜアプリ側ではなくDBトリガーにするか:
--   入会の入口が3つある（Web入会Webhook #129 / 店頭スタッフ承認 / 手修正）。
--   frank-join.ts の ensureLessonKarte は(1)のWebhook経路にしか無く、実際
--   有効会員4名のうちカルテを持つ人は0人だった（2026-08-22時点の本番）。
--   入口ごとに同じ処理を足すと必ずどこかで抜けるので、
--   「member_no が付いた＝入会が確定した」というDBの事実1点に紐づける。
--
-- 退会は削除しない: status='inactive' に落とすだけ。
--   動画・アドバイス・進捗は上達の記録なので消さない（画面側で既定は非表示）。
--
-- 追加のみ（DECISIONS #2）。
-- ============================================================

-- 1. member_code で引く（トリガーと /m/<会員番号> 解決ルートが毎回叩く）
create index if not exists idx_lsn_students_member_code
  on lsn_students (company_id, member_code) where deleted_at is null;

-- 2. FRANK会員 → カルテ
create or replace function sync_frank_member_karte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid;
  v_status text;
begin
  -- 会員番号が付くまでは入会が確定していない（pending/rejectedはここで抜ける）
  if new.member_no is null or btrim(new.member_no) = '' then
    return new;
  end if;

  -- 在籍(active) と 休会(suspended) はレッスンが続くので active 扱い。
  -- 退会(left) と 却下(rejected) は inactive＝一覧から隠す。
  v_status := case when new.status in ('active', 'suspended') then 'active' else 'inactive' end;

  select id into v_student_id
  from lsn_students
  where company_id = new.company_id
    and member_code = new.member_no
    and deleted_at is null
  limit 1;

  if v_student_id is null then
    -- 退会済みで入ってきた行（過去データの移行など）に空カルテは作らない
    if v_status = 'inactive' then
      return new;
    end if;
    insert into lsn_students (company_id, store_id, name, name_kana, member_code, memo, status)
    values (
      new.company_id,
      new.store_id,
      coalesce(nullif(btrim(new.name), ''), new.member_no),
      nullif(btrim(coalesce(new.name_kana, '')), ''),
      new.member_no,
      'FRANK会員登録から自動作成（0119）',
      'active'
    );
    return new;
  end if;

  -- 既にあるカルテは 在籍状態と氏名だけ追従させる（目標・メモ・動画には触らない）
  update lsn_students
  set status     = v_status,
      name       = coalesce(nullif(btrim(new.name), ''), name),
      name_kana  = coalesce(nullif(btrim(coalesce(new.name_kana, '')), ''), name_kana),
      store_id   = coalesce(store_id, new.store_id),
      updated_at = now()
  where id = v_student_id
    and (status is distinct from v_status
      or name is distinct from coalesce(nullif(btrim(new.name), ''), name)
      or store_id is null);

  return new;
end $$;

grant execute on function sync_frank_member_karte() to service_role;

drop trigger if exists trg_sync_frank_member_karte on frunk_members;
create trigger trg_sync_frank_member_karte
  after insert or update of member_no, status, name, name_kana on frunk_members
  for each row execute function sync_frank_member_karte();

-- 3. 既存会員のバックフィル（在籍・休会のみ。カルテが無い人だけ作る）
insert into lsn_students (company_id, store_id, name, name_kana, member_code, memo, status)
select m.company_id,
       m.store_id,
       coalesce(nullif(btrim(m.name), ''), m.member_no),
       nullif(btrim(coalesce(m.name_kana, '')), ''),
       m.member_no,
       'FRANK会員登録から自動作成（0119バックフィル）',
       'active'
from frunk_members m
where m.member_no is not null
  and btrim(m.member_no) <> ''
  and m.status in ('active', 'suspended')
  and m.deleted_at is null
  and not exists (
    select 1 from lsn_students s
    where s.company_id = m.company_id
      and s.member_code = m.member_no
      and s.deleted_at is null
  );

-- 既に退会している会員のカルテがあれば揃えておく
update lsn_students s
set status = 'inactive', updated_at = now()
from frunk_members m
where s.company_id = m.company_id
  and s.member_code = m.member_no
  and s.deleted_at is null
  and m.status in ('left', 'rejected')
  and s.status <> 'inactive';

-- ============================================================
-- 4. トラックマン計測（写真をAIで読む → 人が直して確定）
--    lsn_measurements は 0041 で器だけ用意してあった（0件のまま）。
--    写真そのものと「誰がいつ確定したか」を持たせる。
-- ============================================================
alter table lsn_measurements
  add column if not exists photo_path text,          -- lesson-videos バケット内のパス
  add column if not exists note text,
  add column if not exists shot_no integer,          -- 同じ写真から複数ショットを取る場合の連番
  add column if not exists ai_raw jsonb,             -- AIが読んだ生の結果（人の修正前）。読取精度の検証用
  add column if not exists confirmed_at timestamptz, -- 人が確認したら入る（nullなら未確認＝AIのまま）
  add column if not exists confirmed_by uuid references staff(id);

comment on column lsn_measurements.photo_path is 'トラックマン画面の撮影写真（lesson-videos バケット）';
comment on column lsn_measurements.ai_raw is 'AI読取の生結果。data は人の修正後の確定値なので、精度検証はこの列と突き合わせる';
comment on column lsn_measurements.confirmed_at is 'コーチが確認・修正して確定した時刻。null＝AI読取のまま未確認';

create index if not exists idx_lsn_measurements_video on lsn_measurements (video_id) where deleted_at is null;
