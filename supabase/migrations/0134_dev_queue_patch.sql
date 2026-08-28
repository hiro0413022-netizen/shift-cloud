-- ============================================================
-- 0134: 開発依頼キューを「パッチ受け渡し」で回せるようにする
--
-- 背景（2026-08-28・#182 の直後）:
--   #182 で作った gn_dev_requests を、毎時のスケジュールタスクに
--   消化させようとしたが、そのタスクは端末接続の承認が下りず
--   **クラウドでしか動かない**（古川さんのPCのフォルダに触れない）。
--   承認の案内も出てこなかった。
--
-- 分かったこと（実測・2026-08-28）:
--   リポジトリは public なので、**クラウドのコンテナから clone できる**。
--   npm install も通り、`npm test` 477件・`tsc --noEmit` も完走した。
--   つまり「実装して検証する」ところまではクラウドだけで完結できる。
--   できないのは **push だけ**（2026-08-17: サンドボックスからGitHubへは proxy 403）。
--
-- そこでこうする:
--   クラウド        … clone → 実装 → tsc + テスト → `git diff` をパッチとして保存
--   古川さんのPC    … `.\apply-dev-queue.ps1` を1回叩く
--                     → pull → git apply → commit → push → デプロイ
--
--   #182 の「実装を起こす権限は全部渡し、本番に出す権限だけ人に残す」を
--   そのまま保ったまま、夜のうちに実装が進む形になる。
--
-- 追加のみ。既存の列・行は触らない。
-- ============================================================

alter table gn_dev_requests
  add column if not exists patch text,          -- git diff --cached --binary の中身（適用前の差分そのもの）
  add column if not exists base_sha text,       -- そのパッチを作った時点の origin/main
  add column if not exists verified text,       -- クラウド側で通した検証の結果（tsc / テスト件数）
  add column if not exists applied_at timestamptz, -- 古川さんのPCで取り込んだ時刻
  add column if not exists files_changed int;   -- パッチが触るファイル数（画面に出すだけ）

comment on column gn_dev_requests.patch is 'クラウド側が作った差分。古川さんのPCで git apply --3way して push する。適用済みは applied_at が入る';
comment on column gn_dev_requests.base_sha is 'パッチを作った基点のコミット。ここから main が進んでいると 3way マージになる';
comment on column gn_dev_requests.verified is 'クラウド側で通した検証（例: tsc 通過 / テスト480件パス）。空なら検証していない＝取り込まない';

-- 未取り込みのパッチを引くための索引（apply-dev-queue.ps1 が毎回叩く）
create index if not exists idx_gn_dev_requests_unapplied
  on gn_dev_requests (company_id, status)
  where patch is not null and applied_at is null;
