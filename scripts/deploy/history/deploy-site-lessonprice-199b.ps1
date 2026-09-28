# 公式サイト: レッスン料金から回数券（4回9,000円／8回16,000円）の表記を削除（2026-09-03・#199）
# 内容: sites/frank-golf/assets/site-data.js の price.lessonPrice を
#       「25分マンツーマン 2,500円 ／ 4回チケット 9,000円 ／ 8回チケット 16,000円」
#       → 「25分マンツーマン 2,500円」 に変更しました。
#       （売っているのは1枚2,500円だけなので、HPの表記と店の実務を合わせます）
#       ※ 料金ページ・レッスンページの「レッスン料金」欄が自動で変わります。_build.py の再実行は不要です。
# デプロイされるVercelプロジェクト: frank-golf（＝frankgolf.jp）
# 実行方法: 右クリック→「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\deploy-site-lessonprice-199b.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/4] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock", `
    ".git\MERGE_HEAD.lock", ".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/4] コミット..." -ForegroundColor Cyan
git add sites/frank-golf/assets/site-data.js docs/genesis/DECISIONS.md deploy-site-lessonprice-199b.ps1
git commit -m "frank-golf: レッスン料金から回数券(4回9,000円/8回16,000円)の表記を削除 (#199)"

Write-Host "[3/4] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了。Vercel の frank-golf が READY になったら frankgolf.jp/lesson.html の「レッスン料金」をご確認ください。" -ForegroundColor Green
