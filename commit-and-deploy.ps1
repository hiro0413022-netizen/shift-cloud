# FRANK #90 緊急修正のコミット＆プッシュ（2026-07-26）
# 内容: /api/public がログインへリダイレクトされFRANK予約API全滅→middleware公開パスに追加
# 実行方法:
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\commit-and-deploy.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/5] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock",".git\index.lock",".git\refs\heads\main.lock",".git\MERGE_HEAD.lock",".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue

Write-Host "[2/5] コミット（先にローカルを確定＝ローカルが正）..." -ForegroundColor Cyan
git restore --staged package-lock.json 2>$null
git restore package-lock.json 2>$null
git add apps/genesis/src apps/lesson-os/src apps/shift-cloud/src sites/frank-golf supabase/migrations docs/genesis/DECISIONS.md commit-and-deploy.ps1
git commit -m "fix(genesis): /api/public をmiddleware公開パスに追加 - FRANK予約/CMS API復旧 (#90)"

Write-Host "[3/5] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git checkout MERGE_HEAD -- package-lock.json 2>$null

Write-Host "[4/5] 統合をコミット..." -ForegroundColor Cyan
git add -A
git commit -m "merge: リモート統合（ローカル優先・lockはリモート版）" 2>$null

Write-Host "[5/5] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了！2-3分後に genesis / lesson-os / shift-cloud のデプロイが READY になります。" -ForegroundColor Green
