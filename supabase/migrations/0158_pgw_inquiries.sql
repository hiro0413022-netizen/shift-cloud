-- 0158_pgw_inquiries.sql
-- PRO SITE: お問い合わせ窓口（#235）。
-- 流れ: 公開サイトの /{slug}/contact のフォーム → サーバーがプロ指定のアドレスへメール送信
--       （Reply-To＝問い合わせた方。プロはメールに返信するだけでやり取りできる）。
-- メールは「届け方」で、記録はこの台帳が正。送信設定の不備やメール障害でも問い合わせは消えない
-- （管理画面 /{slug}/admin/inquiries に全件残り、そこから再送できる）。
-- 受信アドレスは公開ページに出さない（スクレイピング対策＝フォーム経由にしている理由）。

-- 1. 受信アドレス（null＝窓口を閉じている。CONTACTの導線も出さない）
alter table pgw_pros add column if not exists contact_email text;

-- 2. お問い合わせ台帳
create table pgw_inquiries (
  id uuid primary key default gen_random_uuid(),
  pro_id uuid not null references pgw_pros(id),
  kind text not null check (kind in ('media', 'sponsor', 'event', 'other')),
  name text not null,
  company text,
  email text not null,
  phone text,
  message text not null,
  mailed_to text,                            -- 送った時点の受信アドレス（後でアドレスを変えても追える）
  mail_status text not null default 'pending' check (mail_status in ('pending', 'sent', 'failed', 'skipped')),
  mail_id text,                              -- Resend message id（届かない相談はこれでログを引く）
  mail_error text,
  ip_hash text,                              -- 連投制限用。生IPは保存しない
  user_agent text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_pgw_inquiries_pro on pgw_inquiries (pro_id, created_at desc) where deleted_at is null;
create index idx_pgw_inquiries_ip on pgw_inquiries (ip_hash, created_at desc);

create trigger set_updated_at before update on pgw_inquiries for each row execute function app.set_updated_at();
alter table pgw_inquiries enable row level security;  -- ポリシー無し＝service_role専用（0114と同じ）
