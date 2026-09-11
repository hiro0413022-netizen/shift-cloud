# ============================================================
# #234 FRANK: ご利用開始月を無料に（先の月から使う方）＋電子サインで画面が動く問題
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-usage-start-234.ps1
#
# ※ migration・環境変数の追加はありません
# ※ GitHub の main に別セッションのコミット（f4577a1 compe）が1つ先に入っています。
#    このスクリプトは commit のあと取り込んで（merge）から push します。
# ============================================================
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
# gitは進捗などをstderrに出すので Stop にしない（誤爆で止まる）。判定は $LASTEXITCODE で行う。
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
  "packages/core/src/frank-billing-start.ts",
  "tests/frank-billing-start.test.ts",
  "apps/genesis/src/lib/frank-join.ts",
  "apps/genesis/src/lib/frank-pos.ts",
  "apps/genesis/src/lib/frank-square-billing.ts",
  "apps/member-os/src/components/signature-pad.tsx",
  "apps/member-os/src/app/join-web/web-join-form.tsx",
  "apps/member-os/src/app/join-web/actions.ts",
  "apps/member-os/src/lib/frank-square.ts",
  "apps/member-os/src/app/(main)/frunk/actions.ts",
  "apps/member-os/src/app/(main)/frunk/[id]/page.tsx",
  "deploy-frank-usage-start-234.ps1"
)

# ⚠ --literal-pathspecs は **git 本体**のオプション。add の前に置く（パスの [id] がワイルドカード扱いになるため）
git --literal-pathspecs add -- $files
$addExit = $LASTEXITCODE
Write-Host "git add の終了コード: $addExit" -ForegroundColor Cyan

$staged = @(git diff --cached --name-only)
Write-Host ""
Write-Host "--- ステージされたファイル ($($staged.Count) 件) ---" -ForegroundColor Cyan
if ($staged.Count -eq 0) { Write-Host "   (空)" -ForegroundColor Red }
$staged | ForEach-Object { Write-Host "   $_" }
Write-Host ""
if ($addExit -ne 0) { Die "git add が失敗しました（終了コード $addExit）。上の一覧を貼ってください。" }

$missing = @()
foreach ($must in $files) {
  if ($must -like "*.ps1") { continue }
  if (-not ($staged | Where-Object { $_ -eq $must })) { $missing += $must }
}
if ($missing.Count -gt 0) { Die "次のファイルがステージに乗っていません:`n   $($missing -join "`n   ")" }

# 中身まで見る（ファイル名だけ合っていても、巻き戻り版なら意味がない）
$checks = @(
  @("packages/core/src/frank-billing-start.ts", "export function usageStartSchedule"),
  @("apps/genesis/src/lib/frank-pos.ts", "usageStartSchedule"),
  @("apps/genesis/src/lib/frank-join.ts", "sch.minTermUntilYmd"),
  @("apps/member-os/src/lib/frank-square.ts", "reschedulePrepayPause"),
  @("apps/member-os/src/app/(main)/frunk/actions.ts", "export async function changeUsageStart"),
  @("apps/member-os/src/app/(main)/frunk/[id]/page.tsx", "changeUsageStart"),
  @("apps/member-os/src/components/signature-pad.tsx", "passive: false")
)
foreach ($c in $checks) {
  if (-not (git show ":$($c[0])" | Select-String -SimpleMatch $c[1])) {
    Die "$($c[0]) に「$($c[1])」がありません（作業ツリーが古いままです）。"
  }
}
Write-Host "本体の中身を確認しました。" -ForegroundColor Green

git commit -m "FRANK: ご利用開始月を無料に＋入会の電子サインで画面が動く問題を修正 (#234)" -m @"
尾内様（FR0048）・大江様（FR0049）: 9/11 入会・ご利用開始 11/2。
入会フォームの「ご利用開始日」を請求が見ておらず、9月無料＋10・11月前取り＋12/11 から自動課金になっていた。

ユーザー決定:
  - 無料になるのはご利用開始月。それより前の月はかからない。前取りはその翌月・翌々月
  - 入会時の21,560円は返金せず12月・1月分に充当。自動課金は2027/2/11から
  - 請求日は入会日と同じ日のまま（Squareの請求基準日は動かさず、休止の周期数を増やす）
  - 6か月継続はご利用開始日から数える

変更:
  - @yozan/core/frank-billing-start に usageStartSchedule（無料月・前取り月・次回請求・継続期限の正典）
  - /join-web: ご利用開始日の上限（入会月から3か月後の月末）と、見積りに無料月・前取り月・初回請求日
  - genesis Webhook: 止める周期数 = 開始月までの月数 + 前取り月数／入会完了メール・控えPDF・min_term_until
  - member-os 会員カード: 【ご利用開始日を変更する】で Square の前取り休止を組み直す（予約を消す→周期数で予約→読み直して日付を確認）
    Square上の次回請求日も並べて表示し、ずれていたら赤で出す
  - 電子サイン: canvas のタッチを passive:false で preventDefault（スクロール・跳ね・ダブルタップ拡大・虫めがね）
    幅が変わったときだけ作り直し、書いた線は描き直す（アドレスバーの出入りで消えていた）

tests: frank-billing-start 18件パス（新規8件）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TfdRU6rMp5KwLieDcvWh36
"@
if ($LASTEXITCODE -ne 0) { Die "commit に失敗しました。" }

# GitHub 側に先行コミットがあるので取り込んでから push する
git pull --no-rebase --no-edit origin main
if ($LASTEXITCODE -ne 0) { Die "git pull（取り込み）に失敗しました。表示を貼ってください。commit は済んでいます。" }

git push origin main
if ($LASTEXITCODE -ne 0) { Die "push に失敗しました。" }

$local  = (git rev-parse HEAD).Trim()
$remote = (git ls-remote origin main).Split()[0].Trim()
if ($local -ne $remote) { Die "push したのに remote が $remote のままです（local $local）。" }
Write-Host ""
Write-Host "remote main = $remote （ローカルと一致）" -ForegroundColor Green
Write-Host ""
Write-Host "Vercel の member-os と yozan-genesis が READY になったら:" -ForegroundColor Green
Write-Host " 1. member-os /frunk から 尾内 有里様（FR0048）の会員カードを開く" -ForegroundColor Cyan
Write-Host " 2. 「ご利用開始」2026/11/02・無料 11月分／前取り 12月・1月分／次回 2027/02/11（予定）" -ForegroundColor Cyan
Write-Host "    その下の Square上の予定 が 2026/12/11 で赤くなっている → 【ご利用開始日を変更する】を押す" -ForegroundColor Cyan
Write-Host " 3. 『Square上の次回の自動課金は 2027/02/11 です（確認済み）』と出れば完了。大江 頼子様（FR0049）も同じ" -ForegroundColor Cyan
