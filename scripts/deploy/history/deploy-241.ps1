# ============================================================
# #241 - show draft shifts on the store dashboard and staff screens
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-241.ps1
#
# Display only. No migration. Money/booking paths still read published-only.
# ASCII-only on purpose (PS 5.1 parses non-BOM UTF-8 as CP932).
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

if (-not (Test-Path ".\commit-msg-241.txt")) { Die "commit-msg-241.txt not found next to this script." }

# the (staff) folder needs --literal-pathspecs: git treats ( ) as pathspec magic
$files = @(
  "apps/shift-cloud/src/lib/store-dash.ts",
  "apps/shift-cloud/src/lib/day-feed.ts",
  "apps/shift-cloud/src/app/store/store-client.tsx",
  "apps/shift-cloud/src/app/(staff)/shifts/page.tsx",
  "apps/shift-cloud/src/app/(staff)/calendar/page.tsx",
  "apps/shift-cloud/src/app/(staff)/calendar/calendar-client.tsx",
  "apps/shift-cloud/src/app/(staff)/home/page.tsx",
  "CHANGELOG.md",
  "deploy-241.ps1",
  "commit-msg-241.txt"
)
foreach ($f in $files) { if (-not (Test-Path -LiteralPath $f)) { Die "missing file: $f" } }

git --literal-pathspecs add -- $files
if ($LASTEXITCODE -ne 0) { Die "git add failed." }

$staged = @(git diff --cached --name-only)
Write-Host ""
Write-Host "--- staged ($($staged.Count)) ---" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "   $_" }
Write-Host ""
if ($staged.Count -lt 9) { Die "expected at least 9 staged files, got $($staged.Count). The working tree may be stale." }

# content checks against the index (not the working tree)
if (-not (git show ":apps/shift-cloud/src/lib/store-dash.ts" | Select-String -SimpleMatch "is_draft")) { Die "store-dash.ts does not contain the change." }
if (-not (git show ":apps/shift-cloud/src/app/(staff)/calendar/page.tsx" | Select-String -SimpleMatch "coworkerPublished")) { Die "calendar/page.tsx does not contain the change." }
if (-not (git show ":apps/shift-cloud/src/lib/day-feed.ts" | Select-String -SimpleMatch "is_draft")) { Die "day-feed.ts does not contain the change." }
Write-Host "content checks passed." -ForegroundColor Green

git commit -F .\commit-msg-241.txt
if ($LASTEXITCODE -ne 0) { Die "commit failed." }

git pull --no-rebase --no-edit origin main
if ($LASTEXITCODE -ne 0) { Die "git pull failed. Paste the output. The commit is already made." }

git push origin main
if ($LASTEXITCODE -ne 0) { Die "push failed." }

$local  = (git rev-parse HEAD).Trim()
$remote = (git ls-remote origin main).Split()[0].Trim()
if ($local -ne $remote) { Die "pushed but remote is still $remote (local $local)." }
Write-Host ""
Write-Host "pushed: remote main = $remote" -ForegroundColor Green
Write-Host "Tell Claude when this finishes - it will watch the Vercel build state (shift-cloud)." -ForegroundColor Cyan
