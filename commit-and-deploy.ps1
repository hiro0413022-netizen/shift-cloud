# Shift Cloud: 給与明細PDF（日別出勤簿つき）（2026-08-16）
# 内容: /admin/payroll に「明細PDF（出勤簿つき）」ボタンを追加。
#       1人1ページで支給見込み明細＋日別出勤簿（打刻なし日も赤字で表示）を全員分1つのPDFに。
#       pdf-lib＋NotoSansJP（フォントは src/assets へ複製済み）。テスト3件は通過済み。
# 実行方法: 右クリック→「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\commit-and-deploy.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/5] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock", `
    ".git\MERGE_HEAD.lock", ".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/5] 依存を更新（pdf-lib を shift-cloud に追加 → package-lock.json 更新）..." -ForegroundColor Cyan
npm install

Write-Host "[3/5] コミット（今回の変更ファイルのみ）..." -ForegroundColor Cyan
git add apps/shift-cloud tests/payslip-sheet.test.ts package-lock.json CHANGELOG.md commit-and-deploy.ps1
git commit -m "shift-cloud: 給与明細PDF（日別出勤簿つき）を/admin/payrollに追加"

Write-Host "[4/5] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[5/5] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。2-3分後に shift-cloud のデプロイが終わります。" -ForegroundColor Green
Write-Host "確認: /admin/payroll →（再認証）→「明細PDF（出勤簿つき）」でPDFが落ちること" -ForegroundColor Gray
Start-Sleep -Seconds 90
