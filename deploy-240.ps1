# ============================================================
# #240 - full system check fixes (2026-09-13)
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-240.ps1
#
# migration 0169 is ALREADY applied via Supabase MCP - this script only commits & pushes code.
# Two commits: (1) app fixes, (2) .github/workflows/ci.yml (needs PAT "workflow" scope;
# if the second push is rejected, the first one is already on GitHub - just tell Claude).
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

foreach ($m in @(".\commit-msg-240.txt", ".\commit-msg-240-ci.txt")) {
  if (-not (Test-Path $m)) { Die "$m not found next to this script." }
}

# --- 0. the receipt route is nested too deep for Claude's file bridge; it was dropped in _stage_tmp. Copy it into place.
$receiptSrc = "_stage_tmp\receipt-route-240.ts"
$receiptDst = "apps\member-os\src\app\(main)\frunk\[id]\receipt\route.ts"
if (-not (Test-Path $receiptSrc)) { Die "$receiptSrc not found." }
# refuse to clobber an uncommitted local edit of the target
git --literal-pathspecs diff --quiet HEAD -- $receiptDst
if ($LASTEXITCODE -ne 0) { Die "$receiptDst has uncommitted local changes. Check with: git diff -- `"$receiptDst`"" }
Copy-Item -LiteralPath $receiptSrc -Destination $receiptDst -Force
if (-not (Select-String -LiteralPath $receiptDst -SimpleMatch "filename*=UTF-8''" -Quiet)) { Die "receipt route copy failed (fix marker not found)." }
Write-Host "receipt route copied." -ForegroundColor Green

# --- 1. app fixes
$files = @(
  "apps/genesis/src/lib/frank-mail.ts",
  "apps/genesis/src/lib/frank-trial.ts",
  $receiptDst,
  "packages/core/src/middleware.ts",
  "apps/craft-os/vercel.json",
  "apps/inventory-os/vercel.json",
  "supabase/migrations/0169_security_hardening_0913.sql",
  "supabase/migrations/README.md",
  "CHANGELOG.md",
  "NEXT_TASKS.md",
  "deploy-240.ps1",
  "commit-msg-240.txt",
  "commit-msg-240-ci.txt"
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
if (-not (git show ":packages/core/src/middleware.ts" | Select-String -SimpleMatch "staleSession")) { Die "middleware.ts does not contain the fix." }
if (-not (git show ":apps/genesis/src/lib/frank-mail.ts" | Select-String -SimpleMatch "frunk.reminder_skipped")) { Die "frank-mail.ts does not contain the fix." }
if (-not (git show ":apps/genesis/src/lib/frank-trial.ts" | Select-String -SimpleMatch "trial.mail_failed")) { Die "frank-trial.ts does not contain the fix." }
git cat-file -e "HEAD:supabase/migrations/0169_security_hardening_0913.sql" 2>$null
if ($LASTEXITCODE -eq 0) { Die "0169 is already in HEAD - was this script already run?" }
Write-Host "content checks passed." -ForegroundColor Green

git commit -F .\commit-msg-240.txt
if ($LASTEXITCODE -ne 0) { Die "commit failed." }

git pull --no-rebase --no-edit origin main
if ($LASTEXITCODE -ne 0) { Die "git pull failed. Paste the output. The commit is already made." }

git push origin main
if ($LASTEXITCODE -ne 0) { Die "push failed." }

$local  = (git rev-parse HEAD).Trim()
$remote = (git ls-remote origin main).Split()[0].Trim()
if ($local -ne $remote) { Die "pushed but remote is still $remote (local $local)." }
Write-Host ""
Write-Host "commit 1 pushed: remote main = $remote" -ForegroundColor Green

# --- 2. CI workflow (separate commit; may be rejected if the PAT lacks the "workflow" scope)
# .github is protected from Claude's file bridge, so the new ci.yml was dropped in _stage_tmp. Copy it into place.
$ciSrc = "_stage_tmp\ci-240.yml"
if (-not (Test-Path $ciSrc)) { Die "$ciSrc not found." }
git diff --quiet HEAD -- ".github/workflows/ci.yml"
if ($LASTEXITCODE -ne 0) { Die ".github/workflows/ci.yml has uncommitted local changes." }
Copy-Item -LiteralPath $ciSrc -Destination ".github\workflows\ci.yml" -Force
git --literal-pathspecs add -- ".github/workflows/ci.yml"
if ($LASTEXITCODE -ne 0) { Die "git add ci.yml failed." }
$staged2 = @(git diff --cached --name-only)
if ($staged2 -contains ".github/workflows/ci.yml") {
  git commit -F .\commit-msg-240-ci.txt
  if ($LASTEXITCODE -ne 0) { Die "ci commit failed." }
  git push origin main
  if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "WARN: the CI workflow commit could not be pushed (PAT without 'workflow' scope?)." -ForegroundColor Yellow
    Write-Host "      Commit 1 (the fixes) IS on GitHub. Undo the local CI commit with:  git reset --soft HEAD~1 ; git restore --staged .github" -ForegroundColor Yellow
    exit 2
  }
  $remote2 = (git ls-remote origin main).Split()[0].Trim()
  Write-Host "commit 2 (ci.yml) pushed: remote main = $remote2" -ForegroundColor Green
} else {
  Write-Host "ci.yml unchanged - nothing to commit for CI." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Tell Claude when this finishes - it will watch the Vercel build state (member-os / yozan-genesis / craft-os / inventory-os)." -ForegroundColor Cyan
