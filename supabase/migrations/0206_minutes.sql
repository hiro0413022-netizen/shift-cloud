-- ============================================================
-- 0206: 議事録システム（apps/minutes・mtg_*）フェーズ1
--
-- 背景（2026-09-27 ユーザー構想）:
--   フェーズ1 文字起こし＋要約（場面ごとに要約の型を変える：契約・開発・営業・法務・弁護士…）
--   フェーズ2 資料作成 ／ フェーズ3 YOZAN専用LLMサーバー（弁護士など秘密性の高い用途）
--
-- 設計の要点（正典 docs/modules/minutes/SYSTEM.md）:
--   1. **機密レベル（L1/L2/L3）は作成時に決め、変えられない**（トリガーで固定）。
--      外部AIに送った時点で機密は戻らないので、行き先を録音前に固定する。
--   2. **L3 の中身（文字起こし・要約・本文）はこのDBに置かない**（check制約）。
--      フェーズ3で保存先ごとYOZANサーバーに置けるまで、L3 は器（件名・日付）しか持てない。
--   3. 同意がないと録音できない（consent_at）。音声は文字起こしが済んだら消す。
--   4. AIの出力は下書き（summary）。人が確定した body だけが正式な議事録。
--   5. アプリは service_role だけで読む。authenticated には一切ポリシーを付けない
--      （L2 は作成者とオーナーだけ、の判定をアプリ側1か所に集める。RESTから覗けないように）。
-- ============================================================

create table if not exists mtg_meetings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  created_by uuid references staff(id),
  title text not null,
  meeting_date date not null,
  participants text,
  level text not null check (level in ('L1', 'L2', 'L3')),
  mode text not null default 'auto',
  mode_suggested text,
  source text not null default 'record' check (source in ('record', 'file', 'text')),
  status text not null default 'draft'
    check (status in ('draft', 'recording', 'transcribing', 'transcribed', 'summarizing', 'summarized', 'confirmed', 'failed')),
  consent_at timestamptz,
  consent_by uuid references staff(id),
  transcript text,
  speakers jsonb not null default '{}'::jsonb,
  summary jsonb,
  body text,
  todos jsonb,
  ai_raw jsonb,
  ai_provider text,
  error text,
  transcript_expires_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint mtg_l3_no_content_in_cloud check (
    level <> 'L3' or (transcript is null and summary is null and body is null and todos is null and ai_raw is null)
  )
);

comment on table mtg_meetings is '議事録（会議1件）。機密レベルは作成時に固定。L3の中身はこのDBに置かない';
comment on column mtg_meetings.level is 'L1通常(クラウドAI) / L2社外秘(学習に使われない有料APIのみ・作成者とオーナーだけ) / L3秘匿(YOZAN専用サーバーのみ)。変更不可';
comment on column mtg_meetings.mode is '要約モード（general/contract/dev/sales/hearing/legal/lawyer/one_on_one）。auto はAIの判定待ち';
comment on column mtg_meetings.summary is 'AIの下書き（各項目に根拠の発言 q と照合結果 check）';
comment on column mtg_meetings.body is '人が確認・修正して確定した議事録本文。正式な議事録はこれだけ';
comment on column mtg_meetings.transcript_expires_at is 'L2: 確定から30日で文字起こしを消す期限';

create index if not exists idx_mtg_meetings_company on mtg_meetings (company_id, meeting_date desc) where deleted_at is null;
create index if not exists idx_mtg_meetings_expire on mtg_meetings (transcript_expires_at) where transcript is not null and transcript_expires_at is not null;

-- 録音の区間（10分ごとに独立した音声ファイル）。区間ごとに文字起こしして、終わった区間から音声を消す
create table if not exists mtg_segments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references mtg_meetings(id),
  company_id uuid not null references companies(id),
  idx int not null check (idx >= 0 and idx < 1000),
  offset_seconds int not null default 0,
  seconds int,
  audio_path text,
  audio_bytes bigint,
  mime text,
  status text not null default 'uploaded' check (status in ('uploaded', 'transcribing', 'transcribed', 'failed')),
  started_at timestamptz,
  transcript text,
  error text,
  audio_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (meeting_id, idx)
);

comment on table mtg_segments is '議事録の録音区間。文字起こしが済んだ区間の音声は即削除（audio_deleted_at）';

create index if not exists idx_mtg_segments_pending on mtg_segments (meeting_id, idx) where status <> 'transcribed';

-- 機密レベルは変えられない（L1で作ってから L3 に上げても、もう外部AIに出ている）
create or replace function mtg_level_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.level is distinct from old.level then
    raise exception '議事録の機密レベルは作成後に変更できません（%→%）', old.level, new.level;
  end if;
  return new;
end $$;

drop trigger if exists trg_mtg_level_immutable on mtg_meetings;
create trigger trg_mtg_level_immutable before update on mtg_meetings
  for each row execute function mtg_level_immutable();

-- RLS: 有効化のみ（ポリシー無し＝authenticated/anon からは一切読めない。アプリは service_role）
alter table mtg_meetings enable row level security;
alter table mtg_segments enable row level security;
revoke all on mtg_meetings, mtg_segments from anon, authenticated;
grant all on mtg_meetings, mtg_segments to service_role;
revoke all on function mtg_level_immutable() from public, anon, authenticated;

-- 音声の置き場（非公開・1ファイル50MBまで）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('minutes-audio', 'minutes-audio', false, 52428800,
        array['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac','audio/x-m4a','audio/m4a','video/mp4','video/webm'])
on conflict (id) do nothing;

-- 権限: まずは本部だけ（社内先行）。現場に広げるときは Shift Cloud /admin/roles で付ける
update roles
set permissions = permissions || '{"use_minutes": true}'::jsonb
where company_id = 'ec00ad2a-4032-4061-bdb7-03face8a04e7'
  and name in ('会社オーナー', '本部');
