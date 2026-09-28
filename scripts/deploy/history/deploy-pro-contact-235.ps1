# ============================================================
# #235 PRO SITE: お問い合わせ窓口（フォーム → プロ指定のメールアドレスへ送信）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-pro-contact-235.ps1
#
# ※ pro-site は Vercel へ直接デプロイ済み（本番READY）。このスクリプトは GitHub に記録を残すだけです。
# ※ migration 0158 は適用済み。
# ============================================================
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
$ErrorActionPreference = "Continue"

function Die($m) { Write-Host ""; Write-Host "■ 中止: $m" -ForegroundColor Red; exit 1 }

foreach ($lock in @(".git\index.lock", ".git\HEAD.lock", ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock")) {
  if (Test-Path $lock) {
    Write-Host "stale な $lock を削除します" -ForegroundColor Yellow
    Remove-Item $lock -Force
  }
}
$head = (git symbolic-ref -q --short HEAD)
if (-not $head)      { Die "HEADが切り離されています。先に  git checkout main  を実行してください。" }
if ($head -ne "main"){ Die "main 以外のブランチ（$head）にいます。" }
Write-Host "ブランチ: $head" -ForegroundColor Cyan

$files = @(
  "supabase/migrations/0158_pgw_inquiries.sql",
  "apps/pro-site/src/lib/inquiry.ts",
  "apps/pro-site/src/lib/inquiry-mail.ts",
  "apps/pro-site/src/lib/auth.ts",
  "apps/pro-site/src/lib/data.ts",
  "apps/pro-site/src/components/contact-cta.tsx",
  "apps/pro-site/src/components/site-header.tsx",
  "apps/pro-site/src/components/site-footer.tsx",
  "apps/pro-site/src/components/admin-ui.tsx",
  "apps/pro-site/src/app/[slug]/(public)/layout.tsx",
  "apps/pro-site/src/app/[slug]/(public)/page.tsx",
  "apps/pro-site/src/app/[slug]/(public)/profile/page.tsx",
  "apps/pro-site/src/app/[slug]/(public)/contact/page.tsx",
  "apps/pro-site/src/app/[slug]/(public)/contact/contact-form.tsx",
  "apps/pro-site/src/app/[slug]/(public)/contact/actions.ts",
  "apps/pro-site/src/app/[slug]/admin/page.tsx",
  "apps/pro-site/src/app/[slug]/admin/actions.ts",
  "apps/pro-site/src/app/[slug]/admin/inquiries/page.tsx",
  "docs/genesis/DECISIONS.md",
  "NEXT_TASKS.md",
  "deploy-pro-contact-235.ps1"
)

# パスの [slug] (public) がワイルドカード扱いにならないよう --literal-pathspecs（git本体のオプション）
git --literal-pathspecs add -- $files
$addExit = $LASTEXITCODE
$staged = @(git diff --cached --name-only)
Write-Host ""
Write-Host "--- ステージされたファイル ($($staged.Count) 件) ---" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "   $_" }
if ($addExit -ne 0) { Die "git add が失敗しました（終了コード $addExit）。" }

$missing = @()
foreach ($must in $files) {
  if ($must -in @("deploy-pro-contact-235.ps1", "docs/genesis/DECISIONS.md", "NEXT_TASKS.md")) { continue }
  if (-not ($staged | Where-Object { $_ -eq $must })) { $missing += $must }
}
if ($missing.Count -gt 0) { Die "次のファイルがステージに乗っていません:`n   $($missing -join "`n   ")" }

$checks = @(
  @("apps/pro-site/src/app/[slug]/(public)/contact/actions.ts", "export async function submitContactAction"),
  @("apps/pro-site/src/lib/inquiry-mail.ts", "export async function deliverInquiry"),
  @("apps/pro-site/src/app/[slug]/admin/inquiries/page.tsx", "requireProAdmin(slug)"),
  @("apps/pro-site/src/lib/data.ts", "contact_email")
)
foreach ($c in $checks) {
  if (-not (git show ":$($c[0])" | Select-String -SimpleMatch $c[1])) {
    Die "$($c[0]) に「$($c[1])」がありません（作業ツリーが古いままです）。"
  }
}
Write-Host "本体の中身を確認しました。" -ForegroundColor Green

git commit -m "PRO SITE: お問い合わせ窓口（フォーム→プロ指定アドレスへメール）(#235)" -m @"
- /{slug}/contact: 種類4つ（取材・メディア出演／スポンサー・協賛／レッスン・イベント出演／応援メッセージ・その他）
- 送信はサーバーから pgw_pros.contact_email へ（Reply-To=問い合わせた方・アドレスはHPに出さない）
- pgw_inquiries（0158）に保存してから送信＝メール失敗でも消えない・管理画面から再送
- 導線: ヘッダーCONTACT／トップとPROFILE最下部の案内／スポンサー欄／フッター（受信アドレス未設定のプロには出さない）
- 管理画面「お問い合わせ」: 受信アドレス設定・一覧・未読バッジ・再送・削除（page側でもログイン検証）
- スパム対策: ハニーポット／表示時刻の署名スタンプ／同一回線10分3件・1日10件
- 自動返信は送らない（ユーザー指定）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gv8NMEExesxdwDLgQyMYRr
"@
if ($LASTEXITCODE -ne 0) { Die "commit に失敗しました。" }

git pull --no-rebase --no-edit origin main
if ($LASTEXITCODE -ne 0) { Die "git pull（取り込み）に失敗しました。commit は済んでいます。表示を貼ってください。" }

git push origin main
if ($LASTEXITCODE -ne 0) { Die "push に失敗しました。" }

$local  = (git rev-parse HEAD).Trim()
$remote = (git ls-remote origin main).Split()[0].Trim()
if ($local -ne $remote) { Die "push したのに remote が $remote のままです（local $local）。" }
Write-Host ""
Write-Host "remote main = $remote （ローカルと一致）" -ForegroundColor Green
Write-Host ""
Write-Host "残りの設定（NEXT_TASKS A-000）:" -ForegroundColor Green
Write-Host " 1. Vercel pro-site に RESEND_API_KEY を追加 → Redeploy" -ForegroundColor Cyan
Write-Host " 2. 各プロの管理画面 →「お問い合わせ」→ 受け取るメールアドレスを保存" -ForegroundColor Cyan
