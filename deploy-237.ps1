# ============================================================
# #237 Business PL frozen since 2026-08-22 + FRANK member count was 0
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-237.ps1
#
# NOTE: This script is ASCII-only on purpose. The previous version was saved
#       without a UTF-8 BOM and PowerShell 5.1 parsed it as CP932 (mojibake).
#       The Japanese commit message lives in commit-msg-237.txt and is passed
#       to git with -F, so PowerShell never has to parse it.
#
# Migrations 0160 / 0161 / 0162 are ALREADY APPLIED to production via Supabase MCP.
# This script only pushes the record files + the two code fixes.
# ============================================================
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
$ErrorActionPreference = "Continue"

function Die($m) { Write-Host ""; Write-Host "ABORT: $m" -ForegroundColor Red; exit 1 }

foreach ($lock in @(".git\index.lock", ".git\HEAD.lock", ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock")) {
  if (Test-Path $lock) {
    Write-Host "removing stale $lock" -ForegroundColor Yellow
    Remove-Item $lock -Force
  }
}

$head = (git symbolic-ref -q --short HEAD)
if (-not $head)       { Die "HEAD is detached. Run  git checkout main  first." }
if ($head -ne "main") { Die "Not on main (current: $head)." }
Write-Host "branch: $head" -ForegroundColor Cyan

if (-not (Test-Path ".\commit-msg-237.txt")) { Die "commit-msg-237.txt not found next to this script." }

# the old broken script is replaced by this one; remove it if it is still there
if (Test-Path ".\deploy-money-refresh-frank-members-237.ps1") {
  Remove-Item ".\deploy-money-refresh-frank-members-237.ps1" -Force
  Write-Host "removed the old mojibake script" -ForegroundColor Yellow
}

$files = @(
  "apps/genesis/src/app/api/cron/daily/route.ts",
  "apps/genesis/src/lib/kernel.ts",
  "apps/genesis/src/components/business-breakdown.tsx",
  "supabase/migrations/0160_fin_segment_frank_golf_rename.sql",
  "supabase/migrations/0161_kpis_upsert_partial_index_fix.sql",
  "supabase/migrations/0162_shift_cloud_kpis_upsert_fix.sql",
  "supabase/migrations/README.md",
  "deploy-237.ps1"
)

git --literal-pathspecs add -- $files
$addExit = $LASTEXITCODE
Write-Host "git add exit code: $addExit" -ForegroundColor Cyan

$staged = @(git diff --cached --name-only)
Write-Host ""
Write-Host "--- staged files ($($staged.Count)) ---" -ForegroundColor Cyan
if ($staged.Count -eq 0) { Write-Host "   (empty)" -ForegroundColor Red }
$staged | ForEach-Object { Write-Host "   $_" }
Write-Host ""
if ($addExit -ne 0) { Die "git add failed (exit $addExit). Paste the list above." }

$missing = @()
foreach ($must in $files) {
  if ($must -like "*.ps1") { continue }
  if (-not ($staged | Where-Object { $_ -eq $must })) { $missing += $must }
}
if ($missing.Count -gt 0) { Die "not staged:`n   $($missing -join "`n   ")" }

# check the staged CONTENT, not just the filenames
$checks = @(
  @("apps/genesis/src/app/api/cron/daily/route.ts", "refresh_money_to_finance"),
  @("apps/genesis/src/lib/kernel.ts", "frunk_members"),
  @("apps/genesis/src/lib/kernel.ts", "frankStoreIds"),
  @("supabase/migrations/0161_kpis_upsert_partial_index_fix.sql", "where store_id is null"),
  @("supabase/migrations/0162_shift_cloud_kpis_upsert_fix.sql", "where store_id is null")
)
foreach ($c in $checks) {
  if (-not (git show ":$($c[0])" | Select-String -SimpleMatch $c[1])) {
    Die "$($c[0]) does not contain '$($c[1])' (stale working tree)."
  }
}
Write-Host "content checks passed." -ForegroundColor Green

git commit -F .\commit-msg-237.txt
if ($LASTEXITCODE -ne 0) { Die "commit failed." }

git pull --no-rebase --no-edit origin main
if ($LASTEXITCODE -ne 0) { Die "git pull failed. Paste the output. The commit is already made." }

git push origin main
if ($LASTEXITCODE -ne 0) { Die "push failed." }

$local  = (git rev-parse HEAD).Trim()
$remote = (git ls-remote origin main).Split()[0].Trim()
if ($local -ne $remote) { Die "pushed but remote is still $remote (local $local)." }
Write-Host ""
Write-Host "remote main = $remote (matches local)" -ForegroundColor Green
Write-Host ""
Write-Host "When Vercel yozan-genesis is READY:" -ForegroundColor Green
Write-Host " 1. GENESIS top -> business performance -> FRANK GOLF -> open the store list" -ForegroundColor Cyan
Write-Host "    expect 48 members / 47 joined this month (was 0 / 0)" -ForegroundColor Cyan
Write-Host " 2. From tomorrow's cron, Money OS entries flow in without pressing any button" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can delete commit-msg-237.txt afterwards (it is untracked)." -ForegroundColor DarkGray
