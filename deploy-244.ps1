# ============================================================
# #244 - GENESIS UI overhaul (7-group menu, stalled band, side panel,
#        KPI drill-down, store launcher, Ctrl K, mobile tabs, voice screen control)
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-244.ps1
#
# No migration. Only apps/genesis + docs + tests.
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

if (-not (Test-Path ".\commit-msg-244.txt")) { Die "commit-msg-244.txt not found next to this script." }

# the (main) folder needs --literal-pathspecs: git treats ( ) as pathspec magic
$files = @(
  "apps/genesis/src/app/(main)/home-actions.ts",
  "apps/genesis/src/app/(main)/layout.tsx",
  "apps/genesis/src/app/(main)/page.tsx",
  "apps/genesis/src/app/(main)/search-actions.ts",
  "apps/genesis/src/app/(main)/stores/page.tsx",
  "apps/genesis/src/app/(main)/todo/page.tsx",
  "apps/genesis/src/app/globals.css",
  "apps/genesis/src/components/command-palette.tsx",
  "apps/genesis/src/components/home/changes-line.tsx",
  "apps/genesis/src/components/home/drill-panel.tsx",
  "apps/genesis/src/components/home/stalled-band.tsx",
  "apps/genesis/src/components/home/todo-hotkeys.tsx",
  "apps/genesis/src/components/home/todo.tsx",
  "apps/genesis/src/components/icons.tsx",
  "apps/genesis/src/components/jarvis.tsx",
  "apps/genesis/src/components/mobile-nav.tsx",
  "apps/genesis/src/components/sidebar.tsx",
  "apps/genesis/src/components/ui.tsx",
  "apps/genesis/src/lib/drilldown.ts",
  "apps/genesis/src/lib/home-pure.ts",
  "apps/genesis/src/lib/jarvis-pure.ts",
  "apps/genesis/src/lib/judgment-feed.ts",
  "apps/genesis/src/lib/nav-badges.ts",
  "apps/genesis/src/lib/nav.ts",
  "apps/genesis/src/lib/stalled-pure.ts",
  "apps/genesis/src/lib/stalled.ts",
  "apps/genesis/src/lib/store-launcher.ts",
  "apps/genesis/src/lib/store-links.ts",
  "apps/genesis/src/lib/todo.ts",
  "tests/genesis-home-244.test.ts",
  "docs/genesis/DECISIONS.md",
  "CHANGELOG.md",
  "NEXT_TASKS.md",
  "deploy-244.ps1",
  "commit-msg-244.txt"
)
foreach ($f in $files) { if (-not (Test-Path -LiteralPath $f)) { Die "missing file: $f" } }

git --literal-pathspecs add -- $files
if ($LASTEXITCODE -ne 0) { Die "git add failed." }

$staged = @(git diff --cached --name-only)
Write-Host ""
Write-Host "--- staged ($($staged.Count)) ---" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "   $_" }
Write-Host ""
if ($staged.Count -lt 30) { Die "expected at least 30 staged files, got $($staged.Count). The working tree may be stale." }

# content checks against the index (not the working tree)
if (-not (git show ":apps/genesis/src/lib/nav.ts" | Select-String -SimpleMatch "NAV_GROUPS")) { Die "nav.ts does not contain the change." }
if (-not (git show ":apps/genesis/src/app/(main)/page.tsx" | Select-String -SimpleMatch "StalledBand")) { Die "page.tsx does not contain the change." }
if (-not (git show ":apps/genesis/src/lib/jarvis-pure.ts" | Select-String -SimpleMatch "detectScreenCommand")) { Die "jarvis-pure.ts does not contain the change." }
git cat-file -e ":apps/genesis/src/components/home/todo.tsx"
if ($LASTEXITCODE -ne 0) { Die "new file todo.tsx is not in the index." }
Write-Host "content checks passed." -ForegroundColor Green

git commit -F .\commit-msg-244.txt
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
Write-Host "Tell Claude when this finishes - it will watch the Vercel build state (yozan-genesis)." -ForegroundColor Cyan
