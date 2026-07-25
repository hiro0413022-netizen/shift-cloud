# FRANK GOLF #85 のコミット＆プッシュ（2026-07-26）
# 内容: LINEグループ配信（自動捕捉＋直接push＋送信先選択）・FRANK実行計画/運営マニュアル/小林電工資料
# 実行方法:
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\commit-and-deploy.ps1

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/4] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\index.lock" -Force -ErrorAction SilentlyContinue
Remove-Item ".git\HEAD.lock" -Force -ErrorAction SilentlyContinue

Write-Host "[2/4] リモートに同期..." -ForegroundColor Cyan
git fetch origin
git pull --rebase origin main

Write-Host "[3/4] コミット..." -ForegroundColor Cyan
git add "apps/genesis/src/app/api/webhooks/line/[code]/route.ts" apps/genesis/src/lib/ai-execution.ts apps/genesis/src/lib/ceo-ai.ts "apps/genesis/src/app/api/public" "apps/genesis/src/app/(main)/site-admin" apps/genesis/src/components/sidebar.tsx sites/frank-golf supabase/migrations docs/genesis/DECISIONS.md NEXT_TASKS.md CHANGELOG.md FRANK_GOLF_出店計画 docs/modules/frank commit-and-deploy.ps1
git commit -m "feat: FRANK 3-5 LINEグループ配信 + 3-1 サイトCMS/ギャラリー (#85)"

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了！2〜3分後にVercelのデプロイが READY になります。" -ForegroundColor Green
