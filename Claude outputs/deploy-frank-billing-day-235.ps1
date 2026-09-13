# ============================================================
# #235 FRANK: 月会費を「毎月10日に翌月分」に（全会員）＋休会・退会・復帰の日付
#
# 使い方:
#   1. このファイルと frank-billing-day-235.patch を、どちらも
#      「C:\Users\hiro0\Claude\Projects\YOZAN GENESIS」に置く（ダウンロードフォルダのままでも可）
#   2. PowerShell で:
#        cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#        .\deploy-frank-billing-day-235.ps1
#
# ※ DBの列追加（migration 0159）は適用済みです。環境変数の追加はありません
# ============================================================
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
$ErrorActionPreference = "Continue"
function Die($m) { Write-Host ""; Write-Host "■ 中止: $m" -ForegroundColor Red; exit 1 }

foreach ($lock in @(".git\index.lock", ".git\HEAD.lock", ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock")) {
  if (Test-Path $lock) { Write-Host "stale な $lock を削除します" -ForegroundColor Yellow; Remove-Item $lock -Force }
}
$head = (git symbolic-ref -q --short HEAD)
if (-not $head)       { Die "HEADが切り離されています。先に  git checkout main  を実行してください。" }
if ($head -ne "main") { Die "main 以外のブランチ（$head）にいます。" }

# パッチを探す（このフォルダ → スクリプトの場所 → ダウンロード）
$patch = $null
foreach ($p in @(".\frank-billing-day-235.patch", (Join-Path $PSScriptRoot "frank-billing-day-235.patch"), (Join-Path $HOME "Downloads\frank-billing-day-235.patch"))) {
  if ($p -and (Test-Path $p)) { $patch = (Resolve-Path $p).Path; break }
}
if (-not $patch) { Die "frank-billing-day-235.patch が見つかりません。このフォルダに置いてください。" }
Write-Host "パッチ: $patch" -ForegroundColor Cyan

# パッチの土台（#234 の merge 6d16d93）が手元にあるか
git fetch origin main 2>$null
git merge-base --is-ancestor 6d16d93 HEAD
if ($LASTEXITCODE -ne 0) {
  Write-Host "手元の main が古いので GitHub の main を取り込みます" -ForegroundColor Yellow
  git merge --ff-only origin/main
  if ($LASTEXITCODE -ne 0) { Die "GitHub の main を取り込めませんでした（git status を貼ってください）。" }
}

$files = @(
  "apps/genesis/src/app/api/cron/execute/route.ts",
  "apps/genesis/src/app/api/public/frank/admin/billing-day/route.ts",
  "apps/genesis/src/app/api/public/frank/pos/webhook/route.ts",
  "apps/genesis/src/lib/frank-billing-day.ts",
  "apps/genesis/src/lib/frank-join.ts",
  "apps/genesis/src/lib/frank-pos.ts",
  "apps/genesis/src/lib/frank-square-billing.ts",
  "apps/member-os/src/app/(main)/frunk/[id]/page.tsx",
  "apps/member-os/src/app/(main)/frunk/actions.ts",
  "apps/member-os/src/app/(main)/frunk/page.tsx",
  "apps/member-os/src/app/join-web/web-join-form.tsx",
  "apps/member-os/src/app/member/settings/page.tsx",
  "apps/member-os/src/lib/frank-billing-pure.ts",
  "apps/member-os/src/lib/frank-mail.ts",
  "apps/member-os/src/lib/frank-square.ts",
  "apps/member-os/src/lib/frank-terms.ts",
  "packages/core/src/frank-billing-start.ts",
  "packages/core/src/frank-membership.ts",
  "sites/frank-golf/_build.py",
  "sites/frank-golf/lp-campaign.html",
  "sites/frank-golf/plan.html",
  "sites/frank-golf/sitemap.xml",
  "sites/frank-golf/terms.html",
  "sites/frank-golf/tokushoho.html",
  "sites/frank-golf/trial.html",
  "supabase/migrations/0159_frank_billing_day.sql",
  "supabase/migrations/README.md",
  "tests/frank-billing-start.test.ts",
  "tests/frank-membership.test.ts"
)

# すでに当ててあるなら飛ばす（2回目の実行）
$already = (git show "HEAD:apps/genesis/src/lib/frank-billing-day.ts" 2>$null)
if ($LASTEXITCODE -eq 0 -and $already) { Die "すでにコミット済みです（frank-billing-day.ts が HEAD にあります）。push だけなら  git push origin main" }

git apply --check --whitespace=nowarn "$patch"
if ($LASTEXITCODE -ne 0) { Die "パッチがきれいに当たりません。上のメッセージを貼ってください（何も変えていません）。" }
git apply --whitespace=nowarn "$patch"
if ($LASTEXITCODE -ne 0) { Die "パッチの適用に失敗しました。" }
Write-Host "パッチを当てました。" -ForegroundColor Green

git --literal-pathspecs add -- $files
$addExit = $LASTEXITCODE
$staged = @(git diff --cached --name-only)
Write-Host ""
Write-Host "--- ステージされたファイル ($($staged.Count) 件) ---" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "   $_" }
if ($addExit -ne 0) { Die "git add が失敗しました（終了コード $addExit）。" }
$missing = @($files | Where-Object { $f = $_; -not ($staged | Where-Object { $_ -eq $f }) })
if ($missing.Count -gt 0) { Die "次のファイルがステージに乗っていません:`n   $($missing -join "`n   ")" }

$checks = @(
  @("packages/core/src/frank-billing-start.ts", "export function chargeDateForMonth"),
  @("apps/genesis/src/lib/frank-billing-day.ts", "export async function rebaseToBillingDay"),
  @("apps/genesis/src/lib/frank-pos.ts", "rebaseToBillingDay"),
  @("apps/member-os/src/app/(main)/frunk/actions.ts", "export async function rebaseBillingDayAll"),
  @("apps/member-os/src/app/(main)/frunk/page.tsx", "rebaseBillingDayAll")
)
foreach ($c in $checks) {
  if (-not (git show ":$($c[0])" | Select-String -SimpleMatch $c[1])) { Die "$($c[0]) に「$($c[1])」がありません。" }
}
Write-Host "本体の中身を確認しました。" -ForegroundColor Green

git commit -m "FRANK: 月会費を毎月10日に翌月分へ（全会員の作り直し・休会/退会/復帰の日付・規約） (#235)" -m @"
ユーザー決定（2026-09-11）:
  - 月会費は毎月10日に翌月分を引き落とす（それまでは入会日と同じ日で人によってバラバラ）
  - 今いる会員も全員切り替える（次回が前倒しになる。二重取り・取り漏れは出ない）
  - 休会の申し出は前々月末まで（11月から休会なら9月末まで）
  - 復帰した月は店頭で1か月分、翌月分から10日の自動引き落とし

仕組み:
  - 正典 @yozan/core/frank-billing-start（chargeDateForMonth 等）と frank-membership（Square に渡す日付）
  - genesis lib/frank-billing-day.ts: 今のサブスクを支払い済み期間の終わりで解約→保存カードで開始日＝最初の10日・請求日10日のサブスクを作成
    claim（5分失効）で同時実行を防ぐ／引退サブスクのWebhookは無視／解約は日付まで確認してから作成／失敗は会員カードに赤
  - 入会Webhookは応答後(after)に作り直し。取りこぼしは cron/execute が拾う。前取りの pause 方式は廃止
  - member-os: /frunk に一括切り替えボタン、会員カードに Square 上の次回日・再実行ボタン
  - billing-day API は admin-sign の署名必須（会員IDだけでは叩けない）
  - 入会画面・完了メール・会員規約(第2/4/5条)・公式サイト・特商法の支払時期を10日払いに
  - migration 0159（適用済）

tests: frank-billing-start 19件・frank-membership 17件パス

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TfdRU6rMp5KwLieDcvWh36
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
Write-Host "Vercel の member-os と yozan-genesis が READY になったら、member-os の /frunk を開いて" -ForegroundColor Green
Write-Host "【まとめて10日払いに切り替える】を「残り」が0になるまで押してください。" -ForegroundColor Green
