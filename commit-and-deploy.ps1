# FRANK: 予約カレンダーの詳細表示 ／ 体験予約を受付台帳へ ／ 会員管理の作り込み（2026-08-18・#139）
# 内容:
#   1) カレンダーの予約名をクリック→詳細（連絡先・会計・来店/取消・会員カードへのリンク）
#   2) 体験予約が入った瞬間に受付台帳（一時利用者名簿）へ自動反映（既存8件は migration 0117 で取込済）
#   3) /frunk 会員管理を 一覧＋検索＋絞り込み に作り直し、/frunk/<id> 会員カードを新設
#   ※ member-os の join-tally-pure.ts（前回の作業ぶん・未コミット）も一緒に入れます
#      → これが無いと member-os のビルドが通りません
# 検証: member-os/genesis の tsc 通過・テスト360件通過・migration 0117 は本番適用済み
# 実行方法: 右クリック→「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\commit-and-deploy.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/4] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock", `
    ".git\MERGE_HEAD.lock", ".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/4] コミット（今回の変更ファイルのみ）..." -ForegroundColor Cyan
git add apps/member-os/src packages/core apps/genesis/src/lib/frank-trial.ts `
    supabase/migrations/0117_frank_trial_walkin_ledger.sql `
    tests/frunk-member-search.test.ts tests/join-tally.test.ts `
    docs/genesis/DECISIONS.md commit-and-deploy.ps1
git commit -m "frank: カレンダーの予約詳細・体験予約を受付台帳へ自動反映・会員管理(一覧/検索/会員カード)を作り込み (#139)"

Write-Host "[3/4] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了。Vercel の member-os / yozan-genesis のデプロイが緑になったら画面を確認してください。" -ForegroundColor Green
