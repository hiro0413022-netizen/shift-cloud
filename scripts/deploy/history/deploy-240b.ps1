# ============================================================
# #240b - the middleware fix from #240 did not actually ship
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-240b.ps1
#
# #240 committed the previous version of packages/core/src/middleware.ts, whose regex
# never matched the real auth-js message, so the stale-cookie fix was inert in production.
# The corrected file is dropped in _stage_tmp\middleware-240b.ts by Claude.
# No migration. ASCII-only on purpose (PS 5.1 parses non-BOM UTF-8 as CP932).
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

if (-not (Test-Path ".\commit-msg-240b.txt")) { Die "commit-msg-240b.txt not found next to this script." }
$src = "_stage_tmp\middleware-240b.ts"
$dst = "packages\core\src\middleware.ts"
if (-not (Test-Path $src)) { Die "$src not found." }
if (-not (Select-String -LiteralPath $src -SimpleMatch "authCode" -Quiet)) { Die "$src is not the corrected version (authCode not found)." }

Copy-Item -LiteralPath $src -Destination $dst -Force
if (-not (Select-String -LiteralPath $dst -SimpleMatch "authCode" -Quiet)) { Die "copy failed (authCode not found in $dst)." }
Write-Host "middleware.ts replaced." -ForegroundColor Green

git --literal-pathspecs add -- "packages/core/src/middleware.ts" "deploy-240b.ps1" "commit-msg-240b.txt"
if ($LASTEXITCODE -ne 0) { Die "git add failed." }

$staged = @(git diff --cached --name-only)
Write-Host ""
Write-Host "--- staged ($($staged.Count)) ---" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "   $_" }
Write-Host ""
if (-not ($staged -contains "packages/core/src/middleware.ts")) { Die "middleware.ts did not change - already committed?" }
if (-not (git show ":packages/core/src/middleware.ts" | Select-String -SimpleMatch "authCode")) { Die "the staged middleware.ts is not the corrected version." }
Write-Host "content checks passed." -ForegroundColor Green

git commit -F .\commit-msg-240b.txt
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
Write-Host "Tell Claude when this finishes." -ForegroundColor Cyan
