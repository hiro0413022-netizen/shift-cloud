-- 0061_ai_execution_autonomy.sql
-- DECISIONS #61 / 2026-07-16
-- 目的: 「AIは提案を保存するだけ・全部承認待ち」を廃止し、リスク階層で
--       自動実行できるものは自動実行、危険なものだけ古川さんに承認要求する（VISION §7/§8）。
-- 併せて Vault の秘密情報を AI が生成・保存できるよう secret_source/managed_by を追加。
--
-- 安全設計: すべて「追加のみ」。既定値は現行動作を保つ（execution_mode 既定=approval）。
--   実際に自動実行が走るのは executor がこの列/ポリシーを読むよう配線してから（NEXT_TASKS）。
--   したがって本migration適用の瞬間は挙動を変えない（スキーマの土台だけ入る）。

-- ============================================================
-- 1. ai_suggestions に実行モードと取消期限を追加
-- ============================================================
alter table ai_suggestions
  add column if not exists execution_mode text not null default 'approval'
    check (execution_mode in ('auto', 'auto_undo', 'approval')),
  add column if not exists undo_deadline timestamptz;

comment on column ai_suggestions.execution_mode is
  'auto=承認不要で即実行（監査ログのみ） / auto_undo=自動実行だが undo_deadline まで取消可 / approval=古川さんの承認必須';
comment on column ai_suggestions.undo_deadline is
  'auto_undo で自動実行した際の取消期限。これを過ぎると確定。';

-- ============================================================
-- 2. 実行ポリシー表（action_type ごとにモードをデータ駆動で設定）
--    kind(sales/cost/ops/...) は話題、action_type は「何を実行するか」。
--    自動化の線引きは action_type で決める（VISION §7の赤/緑リストに対応）。
-- ============================================================
create table if not exists ai_execution_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  action_type text not null,              -- report_generate / line_broadcast / prod_deploy ...
  mode text not null check (mode in ('auto', 'auto_undo', 'approval')),
  undo_minutes int not null default 10,   -- auto_undo のときの取消猶予（分）
  note text,
  updated_at timestamptz not null default now(),
  unique (company_id, action_type)
);

alter table ai_execution_policies enable row level security;
-- policyなし = service_role専用（AIエージェント/サーバのみ変更可。給与系と同じ保護方針 #3）

do $$
declare c uuid;
begin
  select id into c from companies order by created_at limit 1;

  insert into ai_execution_policies (company_id, action_type, mode, undo_minutes, note) values
    -- 緑: 承認不要・即自動実行（作るだけ・社内向け・戻せる）
    (c, 'data_analysis',       'auto', 0,  '分析・集計の実行'),
    (c, 'report_generate',     'auto', 0,  '日次/週次/月次レポート生成'),
    (c, 'kpi_refresh',         'auto', 0,  'KPI再計算'),
    (c, 'draft_create',        'auto', 0,  'SNS/LINE/求人/顧客対応文の下書き作成'),
    (c, 'internal_notify',     'auto', 0,  '社内スタッフ向け通知'),
    (c, 'deliverable_generate','auto', 0,  'AI社員の成果物生成（配信はしない #60）'),
    (c, 'issue_create',        'auto', 0,  'GitHub Issue起票'),
    (c, 'pr_open',             'auto', 0,  'PR作成（マージ=deployは別）'),
    (c, 'test_run',            'auto', 0,  'テスト実行'),
    (c, 'order_candidate',     'auto', 0,  '発注候補の記録（発注確定は別）'),
    -- 黄: 自動実行するが取消枠つき（低リスク・可逆・対内〜軽い対外）
    (c, 'staff_directive',     'auto_undo', 15, 'スタッフへの指示配信'),
    (c, 'line_broadcast',      'auto_undo', 15, '定型LINE一斉配信（SNS AI承認済テンプレ）'),
    (c, 'sns_post',            'auto_undo', 30, 'SNS投稿'),
    -- 赤: 承認必須（不可逆・高額・対外重要・個人情報・法務）VISION §7
    (c, 'prod_deploy',         'approval', 0, '本番デプロイ'),
    (c, 'db_change',           'approval', 0, '本番DB変更'),
    (c, 'payment',             'approval', 0, '課金・支払い'),
    (c, 'large_payment',       'approval', 0, '大型支払い'),
    (c, 'customer_message',    'approval', 0, '顧客への重要連絡'),
    (c, 'personal_info',       'approval', 0, '個人情報の扱い'),
    (c, 'contract',            'approval', 0, '契約の締結・更新・解約'),
    (c, 'hiring',              'approval', 0, '採用・解雇'),
    (c, 'price_change',        'approval', 0, '値上げ・料金変更'),
    (c, 'policy_change',       'approval', 0, '会社の方針変更')
  on conflict (company_id, action_type) do nothing;
end $$;

-- ============================================================
-- 3. Vault: AIが秘密情報を生成・保存できるよう出所を記録
--    （パスワードはユーザーが/vaultで手入力 → AIがMCP経由で生成・保存 に方針変更 #61）
-- ============================================================
alter table vault_systems
  add column if not exists secret_source text not null default 'manual'
    check (secret_source in ('generated', 'external', 'manual')),
  add column if not exists managed_by text not null default 'user'
    check (managed_by in ('user', 'ai'));

comment on column vault_systems.secret_source is
  'generated=AIが自動生成 / external=外部プロバイダ発行値をAIが保存 / manual=人手入力';
comment on column vault_systems.managed_by is 'このシステムの資格情報を誰が管理するか（user/ai）';

-- 強いランダム秘密を生成するユーティリティ（AI/サーバがVault登録時に使う）
create or replace function app.gen_secret(len int default 24)
returns text
language sql
volatile
as $$
  select translate(encode(gen_random_bytes(greatest(len, 12)), 'base64'), '/+=', 'xyz')
$$;

comment on function app.gen_secret(int) is 'Vault等で使う強いランダム文字列を生成（base64→URL安全化）';
