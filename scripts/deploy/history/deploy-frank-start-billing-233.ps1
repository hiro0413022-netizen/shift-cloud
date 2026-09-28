# ============================================================
# #233 3Dセキュアで決済できなかった方に、保存カードから自動課金を立てられるようにする
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-start-billing-233.ps1
#
# ※ migration はありません
# ※ 新しい環境変数もありません（Square の実行は yozan-genesis 側。#188 と同じ形）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

# --- 2026-09-10 の事故の再発防止 -------------------------------------------
# HEADが切り離されたまま作業しており（main は1つ手前を指していた）、
# さらに .git\index.lock が残っていて git add が全部失敗していた。
# それでもスクリプトは「コミット済み」と表示し push は Everything up-to-date で終わった。
if (Test-Path ".git\index.lock") {
  Write-Host "stale な .git\index.lock を削除します" -ForegroundColor Yellow
  Remove-Item ".git\index.lock" -Force
}
$head = (git symbolic-ref -q --short HEAD)
if (-not $head) { throw "HEADが切り離されています。先に  git checkout main  を実行してください（現在: $(git rev-parse --short HEAD)）。" }
if ($head -ne "main") { throw "main 以外のブランチ（$head）にいます。" }
# ---------------------------------------------------------------------------

git add -- `
  "packages/core/package.json" `
  "packages/core/src/frank-billing-start.ts" `
  "apps/genesis/src/lib/frank-join.ts" `
  "apps/genesis/src/lib/frank-square-billing.ts" `
  "apps/genesis/src/app/api/public/frank/admin/start-billing/route.ts" `
  "apps/member-os/src/app/(main)/frunk/actions.ts" `
  "apps/member-os/src/app/(main)/frunk/[id]/page.tsx" `
  "tests/frank-billing-start.test.ts" `
  "CHANGELOG.md" `
  "deploy-frank-start-billing-233.ps1"

if ($LASTEXITCODE -ne 0) { throw "git add に失敗しました。.git\index.lock が残っていないか、HEADが切り離されていないか確認してください。" }

git status --short -- `
  "packages/core/src/frank-billing-start.ts" `
  "apps/genesis/src/app/api/public/frank/admin/start-billing/route.ts" `
  "apps/member-os/src/app/(main)/frunk/actions.ts"

# ⚠ ここは「ステージが空＝コミット済み」と決めつけない（2026-09-10・index.lock で add が失敗し、
#    何もしていないのに『コミット済み』と表示して push が Everything up-to-date で終わった）。
#    HEAD に実物が入っているかで判定する。
git cat-file -e "HEAD:packages/core/src/frank-billing-start.ts" 2>$null
$inHead = ($LASTEXITCODE -eq 0)
git diff --cached --quiet
$staged = ($LASTEXITCODE -ne 0)
if (-not $staged -and -not $inHead) { throw "何もステージされておらず、HEADにも入っていません。add が効いていません。" }
if (-not $staged) {
  Write-Host "コミット済みのため commit は飛ばします。" -ForegroundColor Yellow
} else {
git commit -m "FRANK: 保存カードから月会費の自動課金を立てられるようにした (#233)" -m @"
発端（中尾様 FR0047・2026-09-10）:
  入会の決済でカード会社の3Dセキュア（ワンタイムパスワード）が、
  お客様がもう使っていないメールアドレス宛に送られて受信できず、決済リンクを完走できなかった。
  店側でSquareの顧客にカードを保存し、10月分・11月分は「一回きりの決済」で受領。
  結果、入金は済み・会員にもなっている・サブスクだけ無い、という状態が残った。

1. この状態はどの画面からも救えなかった
   【このiPadで決済ページを開く】(#217) は二重契約を防ぐため billing_status='active' には出さない。
   Squareダッシュボードからも作れない。プランは frank-square-setup.mjs がAPIで作っているため
   「サードパーティを介して作成されたプラン」となり、サブスク作成でプランが選択肢に出ない（実機確認）。
   => APIから作るしかない。その入口を会員カードに置いた。

2. 二重スキップの事故を先に止める
   Webhookの ensurePrepaySetup() は「前取り月数ぶん pause」を走らせる。
   前取りを一括受領済みのこのケースでそのまま作ると、指定した開始日からさらに2か月飛ぶ
   ＝2か月ぶん取り損ねる。Squareに投げる前に prepay_pause_done_at を立てて黙らせる。

3. 日付の式の正典を1か所に（packages/core/src/frank-billing-start.ts）
   入会完了メールがお客様に案内した「次回◯月◯日」と同じ式（入会日＋前取り月数＋1か月）。
   過去日は通さない＝気づかず今日いきなり課金しない。取りこぼした月は店頭精算。

4. Square の実行は yozan-genesis 側（SQUARE_LOCATION_ID があちらにしか無い・#188と同じ）
   認可は member_id（推測不能なUUID）。カードが無い・既にサブスクがある・0円プラン・
   過去日 のときは何も起きない。

tsc（genesis / member-os）通過
tests 673件パス（新規10件）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SabNySQiroaBrn9NnjrsEK
"@
}

git push origin main
if ($LASTEXITCODE -ne 0) { throw "push に失敗しました。" }

# ⚠ push が「Everything up-to-date」で終わる事故があったので、実際に届いたか確かめる
$local  = (git rev-parse HEAD).Trim()
$remote = (git ls-remote origin main).Split()[0].Trim()
if ($local -ne $remote) { throw "push したのに remote が $remote のままです（local $local）。HEADが切り離されていないか確認してください。" }
Write-Host "remote main = $remote （ローカルと一致）" -ForegroundColor Green

Write-Host ""
Write-Host "push 完了。Vercel が READY になったら次の順で確認してください。" -ForegroundColor Green
Write-Host " 1. member-os /frunk から 中尾 清光様（FR0047）の会員カードを開く" -ForegroundColor Cyan
Write-Host " 2. プラン・請求パネルの「自動課金」に【保存カードから自動課金を開始する】が出る" -ForegroundColor Cyan
Write-Host " 3. 初回請求日が 2026-12-10 になっていることを確認して押す" -ForegroundColor Cyan
Write-Host " 4. 表示が『稼働中』に変わる。Squareのサブスクリプション一覧にも1本増える" -ForegroundColor Cyan
Write-Host ""
Write-Host "※ Square側で中尾様の顧客が2つある場合、カードが載っている方が" -ForegroundColor Yellow
Write-Host "   YGK1FVVZZ354EZVC65PZ3XMZXR であることを先に確認してください。" -ForegroundColor Yellow
