# ============================================================
# #249d - hp-admin: YouTube / TikTok source labels + docs
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-hp-admin-249d.ps1
# Migration 0187 is ALREADY applied. ASCII-only on purpose.
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
$files = @(
  "apps/hp-admin/src/components/Dashboard.tsx",
  "supabase/migrations/0187_hp_track_youtube_tiktok.sql",
  "supabase/migrations/README.md",
  "docs/modules/hp-admin/SYSTEM.md",
  "NEXT_TASKS.md",
  "commit-msg-249d.txt",
  "deploy-hp-admin-249d.ps1"
)
$pre = @(git diff --cached --name-only | Where-Object { $files -notcontains $_ })
if ($pre.Count -gt 0) { Die "Something else is already staged ($($pre -join ', ')). Paste  git status  to Claude." }
foreach ($f in $files) { if (-not (Test-Path -LiteralPath $f)) { Die "missing file: $f" } }
git add -- $files
if ($LASTEXITCODE -ne 0) { Die "git add failed." }
$staged = @(git diff --cached --name-only)
$staged | ForEach-Object { Write-Host "   $_" }
if ($staged.Count -lt 5) { Die "expected at least 5 staged files, got $($staged.Count)." }
if (-not (git show ":apps/hp-admin/src/components/Dashboard.tsx" | Select-String -SimpleMatch "youtube:")) { Die "Dashboard.tsx does not contain the change." }
git commit -F .\commit-msg-249d.txt
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
