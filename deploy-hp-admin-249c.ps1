# ============================================================
# #249c - HP admin: connect FRANK GOLF / KALLINOS (photos, news/blog, instagram, tracking)
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-hp-admin-249c.ps1
#
# Migration 0186 is ALREADY applied. Code + docs only.
# CHANGELOG / DECISIONS also carry #252 text written by another session (harmless).
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
if (-not (Test-Path ".\commit-msg-249c.txt")) { Die "commit-msg-249c.txt not found next to this script." }

$files = @(
  "CHANGELOG.md",
  "NEXT_TASKS.md",
  "apps/corporate/src/app/layout.tsx",
  "apps/hp-admin/src/components/AdminApp.tsx",
  "apps/hp-admin/src/components/BlogPanel.tsx",
  "apps/hp-admin/src/components/Dashboard.tsx",
  "apps/hp-admin/src/lib/api.ts",
  "apps/kallinos/auth.html",
  "apps/kallinos/brand.html",
  "apps/kallinos/cart.html",
  "apps/kallinos/contact.html",
  "apps/kallinos/css/style.css",
  "apps/kallinos/faq.html",
  "apps/kallinos/index.html",
  "apps/kallinos/js/components.js",
  "apps/kallinos/legal.html",
  "apps/kallinos/products.html",
  "apps/kallinos/size-guide.html",
  "docs/genesis/DECISIONS.md",
  "docs/modules/hp-admin/SYSTEM.md",
  "sites/frank-golf/404.html",
  "sites/frank-golf/_build.py",
  "sites/frank-golf/access.html",
  "sites/frank-golf/area.html",
  "sites/frank-golf/assets/style.css",
  "sites/frank-golf/beginner.html",
  "sites/frank-golf/booking.html",
  "sites/frank-golf/column.html",
  "sites/frank-golf/community.html",
  "sites/frank-golf/concept.html",
  "sites/frank-golf/corporate.html",
  "sites/frank-golf/facility.html",
  "sites/frank-golf/faq.html",
  "sites/frank-golf/guide-golf-beginner-himeji.html",
  "sites/frank-golf/guide-indoor-golf-himeji.html",
  "sites/frank-golf/guide-trackman.html",
  "sites/frank-golf/himeji-golf-bar.html",
  "sites/frank-golf/himeji-golf-lesson-private.html",
  "sites/frank-golf/himeji-golf-lesson-women.html",
  "sites/frank-golf/himeji-golf-range-unlimited.html",
  "sites/frank-golf/himeji-golf-school-beginner.html",
  "sites/frank-golf/index.html",
  "sites/frank-golf/indoor-golf-cost.html",
  "sites/frank-golf/lesson-booking.html",
  "sites/frank-golf/lesson.html",
  "sites/frank-golf/lounge.html",
  "sites/frank-golf/lp-campaign.html",
  "sites/frank-golf/lp-trial.html",
  "sites/frank-golf/plan.html",
  "sites/frank-golf/privacy.html",
  "sites/frank-golf/sitemap.xml",
  "sites/frank-golf/terms.html",
  "sites/frank-golf/tokushoho.html",
  "sites/frank-golf/trial-booking.html",
  "sites/frank-golf/trial.html",
  "supabase/migrations/README.md",
  "apps/corporate/public/google2b364b4dcd5146c9.html",
  "apps/kallinos/google2b364b4dcd5146c9.html",
  "apps/kallinos/js/hp.js",
  "apps/kallinos/news.html",
  "sites/frank-golf/assets/hp.js",
  "sites/frank-golf/blog.html",
  "supabase/migrations/0186_hp_slots_frank_kallinos.sql",
  "commit-msg-249c.txt",
  "deploy-hp-admin-249c.ps1"
)
$pre = @(git diff --cached --name-only | Where-Object { $files -notcontains $_ })
if ($pre.Count -gt 0) { Die "Something else is already staged ($($pre -join ', ')). Paste  git status  to Claude." }
foreach ($f in $files) { if (-not (Test-Path -LiteralPath $f)) { Die "missing file: $f" } }

git --literal-pathspecs add -- $files
if ($LASTEXITCODE -ne 0) { Die "git add failed." }
$staged = @(git diff --cached --name-only)
Write-Host ""
Write-Host "--- staged ($($staged.Count)) ---" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "   $_" }
Write-Host ""
if ($staged.Count -lt 50) { Die "expected at least 50 staged files, got $($staged.Count). The working tree may be stale." }

if (-not (git show ":sites/frank-golf/index.html" | Select-String -SimpleMatch "assets/hp.js")) { Die "frank-golf index.html does not load hp.js." }
if (-not (git show ":sites/frank-golf/assets/hp.js" | Select-String -SimpleMatch "FRANK_RENDER")) { Die "frank-golf hp.js is incomplete." }
if (-not (git show ":apps/kallinos/js/hp.js" | Select-String -SimpleMatch "hp_public_site")) { Die "kallinos hp.js is incomplete." }
if (-not (git show ":apps/kallinos/index.html" | Select-String -SimpleMatch "data-hp-news-section")) { Die "kallinos index.html does not contain the change." }
if (-not (git show ":apps/hp-admin/src/lib/api.ts" | Select-String -SimpleMatch "postUrl")) { Die "hp-admin api.ts does not contain the change." }
Write-Host "content checks passed." -ForegroundColor Green

git commit -F .\commit-msg-249c.txt
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
