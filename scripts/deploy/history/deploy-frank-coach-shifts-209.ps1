# 会員ページ コーチの出勤予定 (#209)
# 使い方: PowerShell でリポジトリのフォルダに移動して .\deploy-frank-coach-shifts-209.ps1
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

git add supabase/migrations/0146_staff_member_page_role.sql `
        apps/member-os/src/lib/frank-coach-shifts.ts `
        apps/member-os/src/app/member/coaches/page.tsx `
        apps/member-os/src/app/member/page.tsx `
        docs/genesis/DECISIONS.md

git commit -m "frank: 会員ページからコーチの出勤予定を見られるようにした（出すと決めた人だけ・確定シフトのみ） (#209)"

git pull --no-rebase
git push

Write-Host ""
Write-Host "push 完了。Vercel のデプロイが終わったら /member を開いて確認してください。" -ForegroundColor Green
Write-Host "DBの列(member_page_role)は適用済みです。出す人を増やすときは staff.member_page_role に肩書きを入れてください。" -ForegroundColor Yellow
