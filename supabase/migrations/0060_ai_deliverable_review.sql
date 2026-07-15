-- 0060: AI社員の「成果物」を生成→レビュー→承認できるようにする（DECISIONS #60）
-- 背景:
--   これまでCEO AIは毎朝、各AI社員宛ての「指示書（prompts, status=draft）」までは
--   自動生成していたが、その指示を受けて実際の成果物（SNS投稿案・広告見出し等）を
--   作る一段が無く、「AI社員は動いている（指示は出た）のに成果物が無い」状態だった。
--   → 指示書を入力に成果物を生成し、ai_execution_logs.output に保存。
--     朝の一覧（/deliverables）に溜まり、古川さんは承認/却下を押すだけ（VISION §7維持）。
--
-- 設計:
--   - 成果物は ai_execution_logs に1行として残す（output/tokens_used/cost_estimate_yen は既存列を活用）。
--   - review_status で承認フローを持たせる: pending（レビュー待ち）→ approved / rejected。
--     ※ CEO AI自身の日次ログ等、成果物でない行は review_status=NULL のまま（画面の対象外）。
--   - prompt_id で「どの指示書に対する成果物か」を辿れるようにする。
--   - 承認しても配信・課金は行わない（実行は人手 or 別途承認。VISION §7）。

alter table ai_execution_logs
  add column if not exists prompt_id   uuid references prompts(id) on delete set null,
  add column if not exists review_status text,          -- NULL=対象外 / 'pending' / 'approved' / 'rejected'
  add column if not exists reviewed_at   timestamptz,
  add column if not exists reviewed_by   uuid references staff(id) on delete set null;

alter table ai_execution_logs drop constraint if exists ai_execution_logs_review_status_check;
alter table ai_execution_logs
  add constraint ai_execution_logs_review_status_check
  check (review_status is null or review_status in ('pending', 'approved', 'rejected'));

-- レビュー待ちを素早く引くための部分インデックス
create index if not exists idx_ai_exec_logs_review
  on ai_execution_logs (company_id, review_status, finished_at desc)
  where review_status is not null and deleted_at is null;
