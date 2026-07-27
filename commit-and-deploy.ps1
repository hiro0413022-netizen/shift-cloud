# ホームページ営業の基盤化 その1: 配布リンクの閲覧計測（#95 / migration 0085 適用済）
# 内容: packages/track 新設・demo-salesのデモ配信に計測を接続・Genesisホームに「デモ開封」カード
# 実行方法:
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\commit-and-deploy.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/5] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock",".git\index.lock",".git\refs\heads\main.lock",".git\MERGE_HEAD.lock",".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue

Write-Host "[2/5] コミット（先にローカルを確定＝ローカルが正）..." -ForegroundColor Cyan
git add packages/track packages/README.md `
        apps/demo-sales/src apps/demo-sales/package.json apps/demo-sales/next.config.ts `
        apps/genesis/src apps/genesis/package.json apps/genesis/next.config.ts `
        supabase/migrations tests/track.test.ts `
        docs/genesis/DECISIONS.md docs/modules/track docs/modules/demo-sales `
        NEXT_TASKS.md package-lock.json commit-and-deploy.ps1
git commit -m "feat(track): 配布リンクの閲覧計測を共通モジュール化(#95) - demo-salesデモ開封をGenesisホームに通知"

Write-Host "[3/5] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }

Write-Host "[4/5] 統合をコミット..." -ForegroundColor Cyan
git add -A
git commit -m "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[5/5] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。2-3分後に demo-sales と genesis のデプロイが終わります。" -ForegroundColor Green
Write-Host "確認手順:" -ForegroundColor Green
Write-Host "  1. demo-sales の営業先詳細でデモURL(/d/xxxx)をコピーし、スマホなど別端末で開く" -ForegroundColor Gray
Write-Host "     ※管理画面の「デモを開く」は preview=1 付きなので計測されません（これが正しい動作）" -ForegroundColor Gray
Write-Host "  2. 営業先詳細に『先方が閲覧しました』が出る" -ForegroundColor Gray
Write-Host "  3. Genesisのホームに『デモ開封』カードが最上位に出る" -ForegroundColor Gray
