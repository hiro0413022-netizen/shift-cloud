# ============================================================
# #245 + #246 - JARVIS voice accuracy + todo cleanup (inquiries first, dismiss AI items, monthly checks)
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-246.ps1
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

if (-not (Test-Path ".\commit-msg-246.txt")) { Die "commit-msg-246.txt not found next to this script." }

# the (main) folder needs --literal-pathspecs: git treats ( ) as pathspec magic
$files = @(
  "apps/genesis/src/app/api/jarvis/transcribe/route.ts",
  "apps/genesis/src/app/(main)/home-actions.ts",
  "apps/genesis/src/app/(main)/page.tsx",
  "apps/genesis/src/components/home/todo.tsx",
  "apps/genesis/src/components/jarvis.tsx",
  "apps/genesis/src/lib/jarvis-pure.ts",
  "apps/genesis/src/lib/jarvis.ts",
  "apps/genesis/src/lib/judgment-feed.ts",
  "apps/genesis/src/lib/todo.ts",
  "tests/jarvis.test.ts",
  "docs/genesis/DECISIONS.md",
  "CHANGELOG.md",
  "NEXT_TASKS.md",
  "deploy-246.ps1",
  "commit-msg-246.txt"
)
foreach ($f in $files) { if (-not (Test-Path -LiteralPath $f)) { Die "missing file: $f" } }

git --literal-pathspecs add -- $files
if ($LASTEXITCODE -ne 0) { Die "git add failed." }

$staged = @(git diff --cached --name-only)
Write-Host ""
Write-Host "--- staged ($($staged.Count)) ---" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "   $_" }
Write-Host ""
if ($staged.Count -lt 14) { Die "expected at least 14 staged files, got $($staged.Count). The working tree may be stale." }

# content checks against the index (not the working tree)
if (-not (git show ":apps/genesis/src/lib/jarvis-pure.ts" | Select-String -SimpleMatch "createVad")) { Die "jarvis-pure.ts does not contain the change." }
if (-not (git show ":apps/genesis/src/components/jarvis.tsx" | Select-String -SimpleMatch "encodeWav16k")) { Die "jarvis.tsx does not contain the change." }
if (-not (git show ":apps/genesis/src/lib/todo.ts" | Select-String -SimpleMatch "isMonthlyCheckDay")) { Die "todo.ts does not contain the change." }
git cat-file -e ":apps/genesis/src/app/api/jarvis/transcribe/route.ts"
if ($LASTEXITCODE -ne 0) { Die "new file transcribe/route.ts is not in the index." }
Write-Host "content checks passed." -ForegroundColor Green

git commit -F .\commit-msg-246.txt
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
