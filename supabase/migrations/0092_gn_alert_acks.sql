-- 0092: 判断フィードの「整合性・法務・KPIアラート」を確認済みにして消せるようにする
-- これまで「確認する」ボタンは詳細ページへのリンクなだけで、押しても一覧から消えなかった
-- （バグ／2026-08-04 報告）。アラートは種類＋文言（金額・比率などの数値を含む）をキー化して
-- 記録するため、同じ内容が続く限り再表示されず、値が変わる（＝別の問題）と自動的に再表示される。

create table if not exists gn_alert_acks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  alert_key text not null,           -- kind::title のそのまま（内容が変われば別キー＝再表示）
  acked_by uuid,                     -- staff.id
  acked_at timestamptz not null default now(),
  unique (company_id, alert_key)
);

create index if not exists idx_gn_alert_acks_company on gn_alert_acks (company_id);

alter table gn_alert_acks enable row level security;
-- ポリシー無し = service_role専用（Genesisのserver actionからのみ読み書き、gn_feedbackと同じ方式）
