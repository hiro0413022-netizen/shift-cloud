# ============================================================
# #237 / #238 leftovers - find what is ACTUALLY different from HEAD, then commit & push
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-237c.ps1
#
# Why this exists:
#   deploy-237.ps1 / deploy-238.ps1 aborted with "not staged" because most of their
#   files are ALREADY committed (another session swept them in). Those scripts treat
#   "nothing to add" as a failure. This one reports the real state per file and commits
#   only what actually changed.
#
# ASCII-only on purpose (PS 5.1 parses non-BOM UTF-8 as CP932).
# Migrations 0160/0161/0162 are already applied to production via Supabase MCP.
# ============================================================
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
$ErrorActionPreference = "Continue"

function Die($m) { Write-Host ""; Write-Host "ABORT: $m" -ForegroundColor Red; exit 1 }

foreach ($lock in @(".git\index.lock", ".git\HEAD.lock", ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock")) {
  if (Test-Path $lock) { Write-Host "removing stale $lock" -ForegroundColor Yellow; Remove-Item $lock -Force }
}

$head = (git symbolic-ref -q --short HEAD)
if (-not $head)       { Die "HEAD is detached. Run  git checkout main  first." }
if ($head -ne "main") { Die "Not on main (current: $head)." }
Write-Host "branch: $head" -ForegroundColor Cyan

if (-not (Test-Path ".\commit-msg-237c.txt")) { Die "commit-msg-237c.txt not found next to this script." }

$files = @(
  "apps/genesis/src/lib/kernel.ts",
  "apps/genesis/src/components/business-breakdown.tsx",
  "apps/genesis/src/app/api/cron/daily/route.ts",
  "supabase/migrations/0160_fin_segment_frank_golf_rename.sql",
  "supabase/migrations/0161_kpis_upsert_partial_index_fix.sql",
  "supabase/migrations/0162_shift_cloud_kpis_upsert_fix.sql",
  "supabase/migrations/README.md",
  "apps/member-os/src/app/(main)/frunk/actions.ts",
  "apps/member-os/src/app/(main)/frunk/[id]/page.tsx",
  "deploy-237c.ps1"
)

Write-Host ""
Write-Host "--- state of each file ---" -ForegroundColor Cyan
$toAdd = @()
$missing = @()
foreach ($f in $files) {
  if (-not (Test-Path -LiteralPath $f)) { Write-Host ("  MISSING      {0}" -f $f) -ForegroundColor Red; $missing += $f; continue }
  git --literal-pathspecs ls-files --error-unmatch -- $f > $null 2>&1
  if ($LASTEXITCODE -ne 0) { Write-Host ("  NEW          {0}" -f $f) -ForegroundColor Yellow; $toAdd += $f; continue }
  git --literal-pathspecs diff --quiet HEAD -- $f
  if ($LASTEXITCODE -ne 0) { Write-Host ("  CHANGED      {0}" -f $f) -ForegroundColor Yellow; $toAdd += $f }
  else                     { Write-Host ("  same as HEAD {0}" -f $f) -ForegroundColor DarkGray }
}
Write-Host ""
if ($missing.Count -gt 0) { Die "these files are not on disk:`n   $($missing -join "`n   ")" }

if ($toAdd.Count -gt 0) {
  git --literal-pathspecs add -- $toAdd
  if ($LASTEXITCODE -ne 0) { Die "git add failed (exit $LASTEXITCODE)." }
}

$staged = @(git diff --cached --name-only)
Write-Host "--- staged now ($($staged.Count)) ---" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "   $_" }
Write-Host ""

if ($staged.Count -eq 0) {
  Write-Host "Nothing to commit - every file above already matches HEAD." -ForegroundColor Green
  Write-Host "Checking the remote is in sync..." -ForegroundColor Cyan
  $local  = (git rev-parse HEAD).Trim()
  $remote = (git ls-remote origin main).Split()[0].Trim()
  if ($local -ne $remote) { Die "local $local and remote $remote differ. Run  git pull --no-rebase origin main  then  git push origin main" }
  Write-Host "remote main = $remote (matches local). Nothing to do." -ForegroundColor Green
  exit 0
}

# content checks - only for files we are actually committing
$checks = @(
  @("apps/genesis/src/lib/kernel.ts", "hasMtd"),
  @("apps/genesis/src/components/business-breakdown.tsx", "mtdLabel")
)
foreach ($c in $checks) {
  if ($staged -contains $c[0]) {
    if (-not (git show ":$($c[0])" | Select-String -SimpleMatch $c[1])) {
      Die "$($c[0]) does not contain '$($c[1])' (stale working tree)."
    }
  }
}
Write-Host "content checks passed." -ForegroundColor Green

git commit -F .\commit-msg-237c.txt
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
Write-Host "When Vercel yozan-genesis / member-os are READY:" -ForegroundColor Green
Write-Host " - GENESIS top: each business card now shows the CURRENT month above the completed month" -ForegroundColor Cyan
Write-Host "   FRANK GOLF should read 741,493 yen for September" -ForegroundColor Cyan
Write-Host " - FRANK member card FR0051 shows the red reset button" -ForegroundColor Cyan
