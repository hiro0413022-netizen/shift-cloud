# ============================================================
# #235/#236 PRO SITE: お問い合わせ窓口（連絡先を押すと本人のアプリが開く方式）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-pro-contact-236.ps1
#
# ※ サイトは Vercel へ直接デプロイ済み（本番READY）。このスクリプトは GitHub に記録を残すだけです。
# ※ migration 0158 / 0159 は適用済み。
# ※ deploy-pro-contact-235.ps1 を実行済みでも未実行でも、このスクリプト1本で足ります。
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

# #236 でメール送信をやめたので、この1ファイルは削除する
$mail = "apps/pro-site/src/lib/inquiry-mail.ts"
if (Test-Path $mail) { git --literal-pathspecs rm -q -- $mail }

$files = @(
  "supabase/migrations/0158_pgw_inquiries.sql",
  "supabase/migrations/0159_pgw_contact_methods.sql",
  "apps/pro-site/src/lib/inquiry.ts",
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
  "apps/pro-site/src/app/[slug]/(public)/contact/contact-methods.tsx",
  "apps/pro-site/src/app/[slug]/(public)/contact/contact-form.tsx",
  "apps/pro-site/src/app/[slug]/(public)/contact/actions.ts",
  "apps/pro-site/src/app/[slug]/admin/page.tsx",
  "apps/pro-site/src/app/[slug]/admin/actions.ts",
  "apps/pro-site/src/app/[slug]/admin/inquiries/page.tsx",
  "docs/genesis/DECISIONS.md",
  "NEXT_TASKS.md",
  "deploy-pro-contact-235.ps1",
  "deploy-pro-contact-236.ps1"
)

# パスの [slug] (public) がワイルドカード扱いにならないよう --literal-pathspecs（git本体のオプション）
git --literal-pathspecs add -- $files
$addExit = $LASTEXITCODE
$staged = @(git diff --cached --name-only)
Write-Host ""
Write-Host "--- ステージされたファイル ($($staged.Count) 件) ---" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "   $_" }
if ($addExit -ne 0) { Die "git add が失敗しました（終了コード $addExit）。" }

$must = @(
  "apps/pro-site/src/app/[slug]/(public)/contact/contact-methods.tsx",
  "apps/pro-site/src/app/[slug]/admin/inquiries/page.tsx",
  "apps/pro-site/src/lib/data.ts",
  "supabase/migrations/0159_pgw_contact_methods.sql"
)
$missing = @()
foreach ($m in $must) { if (-not ($staged | Where-Object { $_ -eq $m })) { $missing += $m } }
if ($missing.Count -gt 0) { Die "次のファイルがステージに乗っていません:`n   $($missing -join "`n   ")" }

$checks = @(
  @("apps/pro-site/src/app/[slug]/(public)/contact/contact-methods.tsx", "mailtoUrl"),
  @("apps/pro-site/src/lib/data.ts", "hasContactMethod"),
  @("apps/pro-site/src/app/[slug]/admin/actions.ts", "saveContactMethodsAction"),
  @("apps/pro-site/src/app/[slug]/(public)/contact/actions.ts", "mail_status")
)
foreach ($c in $checks) {
  if (-not (git show ":$($c[0])" | Select-String -SimpleMatch $c[1])) {
    Die "$($c[0]) に「$($c[1])」がありません（作業ツリーが古いままです）。"
  }
}
Write-Host "本体の中身を確認しました。" -ForegroundColor Green

git commit -m "PRO SITE: お問い合わせを連絡先カード方式へ（メール送信サービスを使わない）(#235/#236)" -m @"
- /{slug}/contact に連絡先カード: メール（mailto・件名と書く項目のひな形入り）／LINE／InstagramのDM／電話
- 入れた窓口だけがHPに出る。全部空なら CONTACT ごと非表示（hasContactMethod 1か所）
- メールアドレスはbase64で埋めて画面側で復号（収集ロボット対策）＋コピーボタン
- フォームは「メールアプリが使えない方」の控えとして残し、pgw_inquiries に保存するだけ（メールは送らない）
- 管理画面「お問い合わせ」= 窓口の設定（メール/LINE/電話/DM/ひとこと）＋届いた控えの一覧
- Resend 依存を削除（inquiry-mail.ts を削除）。全社の無料枠を FRANK の自動メールのために残す

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
Write-Host "あとは各プロの管理画面 →「お問い合わせ」→ 連絡先を入れて保存するだけです。" -ForegroundColor Green
