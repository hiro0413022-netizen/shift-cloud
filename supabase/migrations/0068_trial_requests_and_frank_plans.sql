-- 体験申込（公開Web） ＋ FRANK GOLF 姫路 料金プラン投入（DECISIONS #72）
-- 公式サイト（sites/frank-golf）の「体験予約」「Web入会」を member-os で受けるための土台。
--
-- ■ 1. mbr_trial_requests … 体験申込（公開フォーム・トークン不要）
--     申込(pending) → スタッフ確認(confirmed) → 対応済(done) / キャンセル(canceled)
--     入会(frunk_members)とは別テーブル（体験は「人が対応する申込型」）
-- ■ 2. frunk_plans … 出資資料の実プラン5件を投入（Web入会のプラン選択に使用）
--     price は税抜・月額。入会金/1日上限は未確定のため null（確定後にUIから編集）
--
-- RLS: 既存 frunk_* と同様、enableのみ（ポリシー無し＝service_role[adminクライアント]専用）。
-- 公開フォームは service_role 経由のサーバーアクションで insert する（RLSをバイパス）。

-- ============ 1. 体験申込テーブル ============
create table if not exists mbr_trial_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),
  name text not null,
  name_kana text,
  phone text,
  email text,
  pref1 text,                 -- 第1希望日時（自由記述）
  pref2 text,                 -- 第2希望
  pref3 text,                 -- 第3希望
  experience text,            -- ゴルフ経験
  message text,               -- ご質問・ご要望
  status text not null default 'pending'
    check (status in ('pending','confirmed','done','canceled')),
  staff_note text,
  source text not null default 'web',
  consent_privacy boolean not null default false,
  reviewed_by uuid references staff(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_mbr_trial_requests_company_status
  on mbr_trial_requests (company_id, status);

alter table mbr_trial_requests enable row level security;

drop trigger if exists set_updated_at on mbr_trial_requests;
create trigger set_updated_at before update on mbr_trial_requests
  for each row execute function app.set_updated_at();

-- ============ 2. FRANK GOLF 姫路 料金プラン投入 ============
-- company_id / store_id は frunk_himeji 店舗のもの（存在すれば投入）。
insert into frunk_plans (company_id, store_id, name, monthly_price, joining_fee, max_bookings_per_day, sort_order, active, note)
select s.company_id, s.id, v.name, v.monthly_price, null, v.max_day, v.sort_order, true, v.note
from stores s
cross join (values
  ('ライト会員',           9800,  1, 1, '平日昼間の利用中心（月8回まで）※表示は税抜'),
  ('レギュラー会員',      13800,  1, 2, '全営業日・1日1時間通い放題（一番人気）※表示は税抜'),
  ('マスター会員',        19800,  2, 3, '全営業日・1日最大2時間まで ※表示は税抜'),
  ('法人ライトプラン',    39800,  1, 4, '最大2名様登録・福利厚生/接待前の調整に ※表示は税抜'),
  ('法人プレミアムプラン',59800,  2, 5, '最大4名様登録・同伴ビジター無料枠つき ※表示は税抜')
) as v(name, monthly_price, max_day, sort_order, note)
where s.code = 'frunk_himeji'
  and not exists (
    select 1 from frunk_plans p
    where p.company_id = s.company_id and p.name = v.name and p.deleted_at is null
  );
