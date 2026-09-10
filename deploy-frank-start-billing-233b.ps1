# ============================================================
# #233b 取り残しの復旧
#
#   2f07e89 には **新規ファイル2つしか入っていません**（route.ts と ps1）。
#   route.ts が import している startSubscriptionOnFile が本体に無いので、
#   このままだと yozan-genesis のビルドが必ず失敗します。
#   このスクリプトで残り全部を入れて直します。
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-start-billing-233b.ps1
#
# ※ migration・環境変数の追加はありません
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

if (Test-Path ".git\index.lock") {
  Write-Host "stale な .git\index.lock を削除します" -ForegroundColor Yellow
  Remove-Item ".git\index.lock" -Force
}
$head = (git symbolic-ref -q --short HEAD)
if (-not $head) { throw "HEADが切り離されています。先に  git checkout main  を実行してください。" }
if ($head -ne "main") { throw "main 以外のブランチ（$head）にいます。" }

# ⚠ --literal-pathspecs 必須。パスの [id] を git はワイルドカード（文字クラス）として
#   解釈するため、付けないと「該当なし」で **1件もステージされない**（2026-09-10 に発生）。
git add --literal-pathspecs -- `
  "packages/core/package.json" `
  "packages/core/src/frank-billing-start.ts" `
  "apps/genesis/src/lib/frank-join.ts" `
  "apps/genesis/src/lib/frank-square-billing.ts" `
  "apps/member-os/src/app/(main)/frunk/actions.ts" `
  "apps/member-os/src/app/(main)/frunk/[id]/page.tsx" `
  "tests/frank-billing-start.test.ts" `
  "CHANGELOG.md" `
  "deploy-frank-start-billing-233b.ps1"
if ($LASTEXITCODE -ne 0) { throw "git add に失敗しました。" }

$staged = @(git diff --cached --name-only)
Write-Host ""
Write-Host "--- ステージされたファイル ($($staged.Count) 件) ---" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "   $_" }
Write-Host ""

# 取り残しの再発防止: 本体が乗っているかを名指しで確認する
foreach ($must in @(
  "packages/core/src/frank-billing-start.ts",
  "apps/genesis/src/lib/frank-square-billing.ts",
  "apps/member-os/src/app/(main)/frunk/actions.ts",
  "apps/member-os/src/app/(main)/frunk/[id]/page.tsx"
)) {
  if (-not ($staged | Where-Object { $_ -eq $must })) {
    throw "$must がステージに乗っていません（上の一覧を確認してください）。"
  }
}
# 中身まで見る（ファイル名だけ合っていても、空の巻き戻り版なら意味がない）
if (-not (git show ":apps/genesis/src/lib/frank-square-billing.ts" | Select-String -SimpleMatch "startSubscriptionOnFile")) {
  throw "frank-square-billing.ts に startSubscriptionOnFile がありません（作業ツリーが巻き戻っています）。"
}
if (-not (git show ":apps/member-os/src/app/(main)/frunk/actions.ts" | Select-String -SimpleMatch "startSquareBilling")) {
  throw "actions.ts に startSquareBilling がありません（作業ツリーが巻き戻っています）。"
}
Write-Host "本体の中身を確認しました。" -ForegroundColor Green

git commit -m "FRANK: #233 の取り残しを復旧（本体・正典・テスト・CHANGELOG）" -m @"
2f07e89 には新規ファイル2つ（route.ts / deploy ps1）しか入っていなかった。
route.ts が import する startSubscriptionOnFile が本体に無く、genesis のビルドが失敗する状態。

原因: 切り離しHEADを直そうとして Cowork のデバイス側シェル（Linuxマウント）から
git checkout main を実行した。インデックス書き込みに失敗する前に作業ツリーだけ巻き戻り、
既存ファイルへの追記（frank-square-billing.ts / actions.ts / page.tsx / package.json /
frank-join.ts / CHANGELOG.md）が消えたまま git add された。
新規ファイルは untracked なので巻き戻りの対象にならず、そこだけが残った。

再発防止:
  - マウント経由で git を走らせない（git status すら index.lock を作る）
  - git add には --literal-pathspecs を付ける（パスの [id] がワイルドカード扱いになる）
  - デプロイ .ps1 で「本体ファイルがステージに乗っているか」を名指し＋中身で確認する

tsc（genesis / member-os）通過
tests 673件パス（新規10件）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SabNySQiroaBrn9NnjrsEK
"@
if ($LASTEXITCODE -ne 0) { throw "commit に失敗しました。" }

git push origin main
if ($LASTEXITCODE -ne 0) { throw "push に失敗しました。" }

$local  = (git rev-parse HEAD).Trim()
$remote = (git ls-remote origin main).Split()[0].Trim()
if ($local -ne $remote) { throw "push したのに remote が $remote のままです（local $local）。" }
Write-Host "remote main = $remote （ローカルと一致）" -ForegroundColor Green

Write-Host ""
Write-Host "Vercel の yozan-genesis と member-os が READY になったら確認してください。" -ForegroundColor Green
Write-Host " 1. member-os /frunk から 中尾 清光様（FR0047）の会員カードを開く" -ForegroundColor Cyan
Write-Host " 2. 「自動課金」に【保存カードから自動課金を開始する】＋初回請求日 2026-12-10" -ForegroundColor Cyan
Write-Host " 3. 押すと『稼働中』に変わり、Squareのサブスクリプション一覧に1本増える" -ForegroundColor Cyan
