# ============================================================
# #237 hotfix - yozan-genesis build was failing with a TypeScript error
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-237d.ps1
#
# supabase-js .rpc() returns a PromiseLike, so .then().catch() does not type-check.
# Verified with a clean clone + npx tsc --noEmit (0 errors) before sending.
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

if (-not (Test-Path ".\commit-msg-237d.txt")) { Die "commit-msg-237d.txt not found next to this script." }

$f = "apps/genesis/src/app/api/cron/daily/route.ts"
git --literal-pathspecs add -- $f "deploy-237d.ps1"
if ($LASTEXITCODE -ne 0) { Die "git add failed." }

$staged = @(git diff --cached --name-only)
Write-Host ""
Write-Host "--- staged ($($staged.Count)) ---" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "   $_" }
Write-Host ""
if (-not ($staged -contains $f)) { Die "$f did not change. The fix may already be committed - check with: git log --oneline -3" }

if (git show ":$f" | Select-String -SimpleMatch ".catch((e) => ({ error: String(e) }))") {
  Die "$f still has the old .catch(...) line (stale working tree)."
}
if (-not (git show ":$f" | Select-String -SimpleMatch "money = rp.error")) {
  Die "$f does not contain the fixed code (stale working tree)."
}
Write-Host "content checks passed." -ForegroundColor Green

git commit -F .\commit-msg-237d.txt
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
Write-Host "Tell Claude when this finishes - it will watch the Vercel build state." -ForegroundColor Cyan
