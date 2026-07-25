-- 0076: LINE Messaging API チャネル（#79・A-4送信側解消）
-- トークン等の秘密は本ファイルに書かない（公開リポジトリ）。seedはMCP経由のSQLで直接投入する。
-- code: 'staff'(YOZANスタッフ連絡用) / 'gw_visitor'(GWビジター用) / 'gw_member'(GW会員様用)

create table if not exists gn_line_channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text not null,
  name text not null,
  access_token text not null,    -- 長期チャネルアクセストークン（DBのみ・service_role専用）
  channel_secret text,           -- 受信(webhook)用。発行され次第設定
  audience text not null default 'customer' check (audience in ('staff','customer')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

alter table gn_line_channels enable row level security;
-- ポリシー無し = service_role専用（トークンを含むため）
