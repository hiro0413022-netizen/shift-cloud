# FRANK #90修正＋実写写真の反映（2026-07-26）
# 内容: ①/api/public公開パス修正（予約API復旧） ②DREAM HOUSE写真をダウンロードしてサイトに配置（許諾済）
# 実行方法:
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\commit-and-deploy.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/6] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock",".git\index.lock",".git\refs\heads\main.lock",".git\MERGE_HEAD.lock",".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue

Write-Host "[2/6] DREAM HOUSE写真をダウンロードして配置..." -ForegroundColor Cyan
$imgDir = "sites\frank-golf\assets\img"
$photos = @{
  "hero.jpg"      = "https://tanosu.com/wp/wp-content/uploads/2025/11/dreamhouse_11.jpg"
  "concept.jpg"   = "https://tanosu.com/wp/wp-content/uploads/2025/11/dreamhouse_3.jpg"
  "play.jpg"      = "https://tanosu.com/wp/wp-content/uploads/2025/11/dreamhouse_5.jpg"
  "lounge.jpg"    = "https://tanosu.com/wp/wp-content/uploads/2025/11/dreamhouse_1.jpg"
  "community.jpg" = "https://tanosu.com/wp/wp-content/uploads/2025/11/dreamhouse_4.jpg"
  "lesson.jpg"    = "https://tanosu.com/wp/wp-content/uploads/2025/11/dreamhouse_6.jpg"
}
foreach ($name in $photos.Keys) {
  try {
    Invoke-WebRequest -Uri $photos[$name] -OutFile (Join-Path $imgDir $name) -UseBasicParsing
    Write-Host "  OK: $name" -ForegroundColor Green
  } catch {
    Write-Host "  失敗: $name （後で個別に保存してください）" -ForegroundColor Yellow
  }
}

Write-Host "[3/6] コミット（先にローカルを確定＝ローカルが正）..." -ForegroundColor Cyan
git restore --staged package-lock.json 2>$null
git restore package-lock.json 2>$null
git add apps/genesis/src apps/lesson-os/src apps/shift-cloud/src sites/frank-golf supabase/migrations docs/genesis/DECISIONS.md commit-and-deploy.ps1
git commit -m "fix(genesis): /api/publicを公開パスに追加(#90) + feat(site): DREAM HOUSE実写写真6枚を反映（許諾済）"

Write-Host "[4/6] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git checkout MERGE_HEAD -- package-lock.json 2>$null

Write-Host "[5/6] 統合をコミット..." -ForegroundColor Cyan
git add -A
git commit -m "merge: リモート統合（ローカル優先・lockはリモート版）" 2>$null

Write-Host "[6/6] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了！2-3分後に https://frank-golf.vercel.app に写真が反映されます。" -ForegroundColor Green
