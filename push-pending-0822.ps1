# やりかけ分の仕上げ（2026-08-22）
#   1) pro-site（#137）の全ソース＋migration 0114/0115 → コミット済み（debfc0d）。push だけ残り
#   2) 給与明細PDF（shift-cloud /admin/payroll/pdf）→ ステージ済み。ロックの都合でコミットできず
# 使い方: 右クリック→「PowerShellで実行」 または
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\push-pending-0822.ps1

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/3] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/3] 給与明細PDFをコミット（ステージ済みの5ファイルのみ）..." -ForegroundColor Cyan
git add -- "apps/shift-cloud/src/app/admin/payroll/pdf" "apps/shift-cloud/src/assets" `
    "apps/shift-cloud/src/lib/payslip-pdf.ts" "apps/shift-cloud/src/lib/payslip-sheet.ts" `
    "tests/payslip-sheet.test.ts"
git commit -m "shift-cloud: 給与明細PDF（日別出勤簿つき）/admin/payroll/pdf" -m @"
- 1スタッフ=1ページ(A4縦)で支給見込み明細＋日別出勤簿を全員分1PDF
- 金額は payroll_items をそのまま印字（再計算しない）。打刻なし日は赤字
- 非オーナーは自店舗配属スタッフのみサーバー側で絞る。監査ログ payroll.export_pdf
- フォントは NotoSansJP を src/assets に同梱（subset埋込はCJK欠落のため不可）
- package.json / next.config の依存・outputFileTracingIncludes は前回コミット済み。今回は本体ファイルを収録
- tests/payslip-sheet.test.ts 3件通過

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MBuDuUE2LNoKMb18weRNs9
"@

Write-Host "[3/3] push（Vercel が shift-cloud を自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。shift-cloud のデプロイ後、管理＞給与＞「明細PDF（出勤簿つき）」が開けます。" -ForegroundColor Green
Write-Host "pro-site は Vercel 直接デプロイ済みなので、今回の push で動作は変わりません（ソースがgitに入っただけ）。" -ForegroundColor Gray
