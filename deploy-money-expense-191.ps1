# ============================================================
# #191 Money OS 経費の支出（納品書ぶん）をスタッフが入力できるようにする
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-money-expense-191.ps1
#
# ※ migration 0138 は適用済み（2026-09-01・MCP）
# ※ コミットは作成済みです。残っていれば追加でコミットし、push します
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "supabase/migrations/0138_expense_staff_input.sql" `
  "apps/money-golfwing/src/lib/expense.ts" `
  "apps/money-golfwing/src/app/(main)/expense/page.tsx" `
  "apps/money-golfwing/src/app/(main)/expense/actions.ts" `
  "apps/money-golfwing/src/app/(main)/expense/ExpenseEntry.tsx" `
  "apps/money-golfwing/src/components/nav.tsx" `
  "tests/expense-input.test.ts" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "NEXT_TASKS.md" `
  "deploy-money-expense-191.ps1"

git status --short

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "コミット済みのため commit は飛ばします。" -ForegroundColor Yellow
} else {
  Write-Host "コミットします..." -ForegroundColor Cyan
}

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel が READY になったら次の順で確認してください。" -ForegroundColor Green
Write-Host " 1. Money OS の上部メニューに【経費入力】が出る" -ForegroundColor Cyan
Write-Host " 2. 「店の現金」で1件入れる → 現金出納に出金が増えて残高が減る" -ForegroundColor Cyan
Write-Host " 3. その行を削除する → 出納の行も消えて残高が戻る" -ForegroundColor Cyan
Write-Host " 4. 「掛け（後日振込）」で1件入れる → 上部に『あとで支払い・精算するもの』が出る" -ForegroundColor Cyan
Write-Host ""
Write-Host "掛けの振込は【カード・口座取込 ＞ 支払の消込】で必ず結んでください（結ばないと二重計上）。" -ForegroundColor Yellow
