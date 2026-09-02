# ============================================================
# #196 電子伝票の通知音を最初からONにする
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-orders-sound-196.ps1
#
# ※ migration はありません
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

foreach ($f in @(".git\HEAD.lock", ".git\index.lock", ".git\COMMIT_EDITMSG.lock")) {
  if (Test-Path $f) { Remove-Item $f -Force; Write-Host "removed $f" -ForegroundColor Yellow }
}
Get-ChildItem -Path ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

git add -- `
  "apps/member-os/src/app/orders/live.tsx" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "deploy-orders-sound-196.ps1"

git status --short

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "コミット済みのため commit は飛ばします。" -ForegroundColor Yellow
} else {
git commit -m "電子伝票: 通知音を最初からONにした (#196)" -m @"
ユーザー依頼:
  電子伝票の画面で最初から音オンにしておいてください。

1. これまでは開くたびに【音をONにする】を押す必要があった
   #189 で音そのものは作り直したが、ONにする操作は残っていた。
   iPadを再起動した・タブを開き直した・スタッフが交代した、
   のどれでも無音に戻る。押し忘れに誰も気づけないのが一番困る。

2. 開いた瞬間に AudioContext を作って resume() を試み、表示も最初から「音ON」
   ⚠ iPad Safari / Chrome は一度も操作していないページで音を鳴らせない
   （自動再生の制限）。これはこちら側の設定では外せない。

3. なので「押させる」のをやめて「触れば効く」にした
   鳴らせない間は window の pointerdown / touchstart / keydown を拾って resume()。
   伝票を1枚押しただけ・スクロールしただけで音が使えるようになる。
   開店時に一度触れば、その日はもう意識しなくてよい。

4. 鳴らせない状態は小さなボタンではなく帯で出す
   「画面を一度タップすると音が鳴ります」（琥珀色）。
   気づかないまま無音で営業するのを防ぐのが目的なので、目立たせる側に倒す。
   onstatechange と visibilitychange で状態を追い、放置で落ちても復帰させる。

5. 「音を止める」も残した（夜間の事務作業など）

member-os の tsc --noEmit と next build 通過（クラウドでcloneして実走）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0171JzpCc7kcd7TBBCs68mDu
"@
}

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel が READY になったら受付iPadで確認してください。" -ForegroundColor Green
Write-Host " 1. /orders を開く → 右上が最初から『🔔 音ON』" -ForegroundColor Cyan
Write-Host " 2. 琥珀色の『画面を一度タップすると音が鳴ります』が出たら、画面をどこか触る → 音ONに変わる" -ForegroundColor Cyan
Write-Host " 3. 【テスト再生】で音量を確認" -ForegroundColor Cyan
