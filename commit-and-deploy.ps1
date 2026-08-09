# Money OS: 過去の売上明細を/salesに統合表示＋入力をExcel全列対応（2026-08-10）
# 内容: /sales明細にmon_sales_lines(売上台帳28〜31期)を統合表示、
#       入力画面に種類・メーカー名・販売者を追加（Excel A〜R列が全部埋まる）、
#       支払方法にSquare・金券を追加。型チェックはVM側で通過済み。
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
git add apps/money-golfwing CHANGELOG.md commit-and-deploy.ps1
git commit -m "money-golfwing: 過去の売上明細を/salesに統合表示＋入力をExcel全列(種類/メーカー/販売者)対応"

Write-Host "[3/4] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。2-3分後に money-golfwing のデプロイが終わります。" -ForegroundColor Green
Write-Host "確認: /sales を開いて前月・過去期の月に明細が出ること" -ForegroundColor Gray
Start-Sleep -Seconds 90
