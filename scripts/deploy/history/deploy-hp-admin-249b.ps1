# ============================================================
# #249b - hp-admin build fix: Vercel did not detect Next.js (framework=null)
#   -> "No Output Directory named public". Pin framework in apps/hp-admin/vercel.json.
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-hp-admin-249b.ps1
# ASCII-only on purpose.
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

$files = @("apps/hp-admin/vercel.json", "deploy-hp-admin-249b.ps1")
$pre = @(git diff --cached --name-only | Where-Object { $files -notcontains $_ })
if ($pre.Count -gt 0) { Die "Something else is already staged ($($pre -join ', ')). Paste  git status  to Claude." }
if (-not (Get-Content -Raw "apps/hp-admin/vercel.json" | Select-String -SimpleMatch '"framework"')) { Die "apps/hp-admin/vercel.json was reverted by something on this PC. Tell Claude." }
foreach ($f in $files) { if (-not (Test-Path -LiteralPath $f)) { Die "missing file: $f" } }
git add -- $files
if ($LASTEXITCODE -ne 0) { Die "git add failed." }
if (-not (git show ":apps/hp-admin/vercel.json" | Select-String -SimpleMatch '"framework": "nextjs"')) { Die "vercel.json does not contain the fix." }

git commit -m "hp-admin: pin framework=nextjs in vercel.json (Vercel build found no output dir) (#249b)" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01JoG5HAQWSdLw3VCnRJYGuE"
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
