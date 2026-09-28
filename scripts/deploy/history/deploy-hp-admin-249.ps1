# ============================================================
# #249 - HP admin (no-code homepage editor) + yozan-inc.jp blog/instagram/tracking
# (deploy-249.ps1 was taken by another session -> this file has its own name)
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-hp-admin-249.ps1
#
# Migrations 0184/0185 and Edge Function hp-admin are ALREADY applied. Code only.
# CHANGELOG / NEXT_TASKS / DECISIONS for #249 are already on main (went in with #248/#250).
# New Vercel project yozan-hp-admin (root apps/hp-admin) deploys on this push.
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

if (-not (Test-Path ".\commit-msg-249.txt")) { Die "commit-msg-249.txt not found next to this script." }

# anything already staged by someone else would ride along -> stop
$pre = @(git diff --cached --name-only)
if ($pre.Count -gt 0) { Die "Something is already staged ($($pre.Count) files). Paste  git status  to Claude." }

$files = @(
  "apps/corporate/src/app/about/page.tsx",
  "apps/corporate/src/app/blog/[slug]/page.tsx",
  "apps/corporate/src/app/blog/page.tsx",
  "apps/corporate/src/app/business/page.tsx",
  "apps/corporate/src/app/contact/page.tsx",
  "apps/corporate/src/app/globals.css",
  "apps/corporate/src/app/layout.tsx",
  "apps/corporate/src/app/marketing/page.tsx",
  "apps/corporate/src/app/page.tsx",
  "apps/corporate/src/app/recruit/page.tsx",
  "apps/corporate/src/app/robots.ts",
  "apps/corporate/src/app/sitemap.ts",
  "apps/corporate/src/app/vision/page.tsx",
  "apps/corporate/src/components/Header.tsx",
  "apps/corporate/src/components/InstagramFeed.tsx",
  "apps/corporate/src/components/MotionFx.tsx",
  "apps/corporate/src/components/PostCard.tsx",
  "apps/corporate/src/components/Tracker.tsx",
  "apps/corporate/src/lib/body.ts",
  "apps/corporate/src/lib/cms.ts",
  "apps/hp-admin/next-env.d.ts",
  "apps/hp-admin/next.config.ts",
  "apps/hp-admin/package.json",
  "apps/hp-admin/postcss.config.mjs",
  "apps/hp-admin/src/app/globals.css",
  "apps/hp-admin/src/app/icon.svg",
  "apps/hp-admin/src/app/layout.tsx",
  "apps/hp-admin/src/app/page.tsx",
  "apps/hp-admin/src/components/AdminApp.tsx",
  "apps/hp-admin/src/components/BlogPanel.tsx",
  "apps/hp-admin/src/components/Dashboard.tsx",
  "apps/hp-admin/src/components/GuidePanel.tsx",
  "apps/hp-admin/src/components/ImagePicker.tsx",
  "apps/hp-admin/src/components/InstagramPanel.tsx",
  "apps/hp-admin/src/components/SettingsPanel.tsx",
  "apps/hp-admin/src/components/SlotsPanel.tsx",
  "apps/hp-admin/src/components/ui.tsx",
  "apps/hp-admin/src/lib/api.ts",
  "apps/hp-admin/src/lib/body.ts",
  "apps/hp-admin/src/lib/config.ts",
  "apps/hp-admin/tsconfig.json",
  "apps/hp-admin/vercel.json",
  "commit-msg-249.txt",
  "docs/modules/hp-admin/SYSTEM.md",
  "package-lock.json",
  "supabase/functions/hp-admin/index.ts",
  "supabase/migrations/0184_hp_cms.sql",
  "supabase/migrations/0185_hp_sites_live.sql",
  "supabase/migrations/README.md",
  "deploy-hp-admin-249.ps1"
)
foreach ($f in $files) { if (-not (Test-Path -LiteralPath $f)) { Die "missing file: $f" } }

git --literal-pathspecs add -- $files
if ($LASTEXITCODE -ne 0) { Die "git add failed." }

$staged = @(git diff --cached --name-only)
Write-Host ""
Write-Host "--- staged ($($staged.Count)) ---" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "   $_" }
Write-Host ""
if ($staged.Count -lt 40) { Die "expected at least 40 staged files, got $($staged.Count). The working tree may be stale." }

# content checks against the index (not the working tree)
if (-not (git show ":apps/corporate/src/lib/cms.ts" | Select-String -SimpleMatch "hp_public_site")) { Die "cms.ts does not contain the change." }
if (-not (git show ":apps/corporate/src/app/page.tsx" | Select-String -SimpleMatch "InstagramFeed")) { Die "corporate page.tsx does not contain the change." }
if (-not (git show ":apps/hp-admin/src/components/AdminApp.tsx" | Select-String -SimpleMatch "hp_admin_me")) { Die "AdminApp.tsx is incomplete." }
if (-not (git show ":apps/hp-admin/src/components/Dashboard.tsx" | Select-String -SimpleMatch "function Table")) { Die "Dashboard.tsx is incomplete (tail cut?)." }
if (-not (git show ":package-lock.json" | Select-String -SimpleMatch '"apps/hp-admin"')) { Die "package-lock.json does not contain apps/hp-admin." }
Write-Host "content checks passed." -ForegroundColor Green

git commit -F .\commit-msg-249.txt
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
Write-Host "Tell Claude when this finishes - it will watch the Vercel builds (yozan-hp-admin / yozan-corporate)." -ForegroundColor Cyan
