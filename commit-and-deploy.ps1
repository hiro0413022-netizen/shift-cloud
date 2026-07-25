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
git restore --staged package-lock.json 2>$null; git add apps/genesis/src/lib/frank-booking.ts "apps/genesis/src/app/api/public" sites/frank-golf supabase/migrations docs/genesis/DECISIONS.md CHANGELOG.md NEXT_TASKS.md commit-and-deploy.ps1
git commit -m "feat(frank): 打席予約v1 - 0081 + 公開API + booking.html (#86)"

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了！2〜3分後にVercelのデプロイが READY になります。" -ForegroundColor Green
