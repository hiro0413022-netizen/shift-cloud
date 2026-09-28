# ============================================================
# #238 FRANK: card-less subscription reset (Yamane FR0051)
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-238.ps1
#
# ASCII-only on purpose (PS 5.1 parses non-BOM UTF-8 as CP932).
# The Japanese commit message is in commit-msg-238.txt and passed with -F.
# No migration, no env vars.
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

if (-not (Test-Path ".\commit-msg-238.txt")) { Die "commit-msg-238.txt not found next to this script." }

$files = @(
  "apps/member-os/src/app/(main)/frunk/actions.ts",
  "apps/member-os/src/app/(main)/frunk/[id]/page.tsx",
  "deploy-238.ps1"
)

# --literal-pathspecs is a GIT option and must come before `add` ([id] would glob otherwise)
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

$checks = @(
  @("apps/member-os/src/app/(main)/frunk/actions.ts", "export async function resetSquareBilling"),
  @("apps/member-os/src/app/(main)/frunk/[id]/page.tsx", "resetSquareBilling")
)
foreach ($c in $checks) {
  if (-not (git show ":$($c[0])" | Select-String -SimpleMatch $c[1])) {
    Die "$($c[0]) does not contain '$($c[1])' (stale working tree)."
  }
}
Write-Host "content checks passed." -ForegroundColor Green

git commit -F .\commit-msg-238.txt
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
Write-Host "When Vercel member-os is READY:" -ForegroundColor Green
Write-Host " 1. Save Yamane's card in the Square dashboard (Customers > Yamane Yumi > payment methods)" -ForegroundColor Cyan
Write-Host " 2. member-os > FRANK members > FR0051 > press the red 'reset' button" -ForegroundColor Cyan
Write-Host " 3. Press 'start billing from saved card' with 2026-12-10" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can delete commit-msg-238.txt afterwards (it is untracked)." -ForegroundColor DarkGray
