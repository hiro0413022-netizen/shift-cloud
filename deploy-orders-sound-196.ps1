# ============================================================
# #196/#197 電子伝票の音を最初からON ＋ 予約・体験申込の画面を自動更新
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
  "apps/member-os/src/components/chime.ts" `
  "apps/member-os/src/components/live-refresh.tsx" `
  "apps/member-os/src/lib/frank-reservation.ts" `
  "apps/member-os/src/app/(main)/reservations/page.tsx" `
  "apps/member-os/src/app/(main)/trials/page.tsx" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "deploy-orders-sound-196.ps1"

git status --short

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "コミット済みのため commit は飛ばします。" -ForegroundColor Yellow
} else {
git commit -m "予約画面を自動更新にし、電子伝票の音を最初からONにした (#196/#197)" -m @"
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

6. 予約画面はリロードを押すまで新しい予約が出なかった（#197）
   /reservations も /trials も force-dynamic なだけで、開いたまま置くと古いまま。
   予約はお客様が24時間いつでも入れる＝押し忘れがそのまま見落としになる。
   15秒（体験は20秒）ごとに router.refresh() で取り直す。
   画面まるごとのリロードではないので入力中のフォームもスクロール位置も飛ばない。

7. Supabase Realtime は採らなかった
   ブラウザから購読するには店頭端末に予約テーブルを読めるキーを置くことになる。
   得られるのは15秒→1秒未満の差で、見落とし防止には15秒で足りる。

8. 別タブを見ている間は止め、戻った瞬間に取り直す
   最終更新の時刻を常に出す（画面が止まっていないことが目で分かる）。
   変わったときだけ緑のバッジと音。毎回鳴らすと誰も聞かなくなる。

9. 判定は「今日以降の予約＋体験申込」の件数と最終更新時刻
   表示している日だけ見ると来週の予約が入っても気づけない。
   件数だけだと「1件入って1件キャンセル」で同じ数になる。

10. 音は components/chime.ts に共通化（実装を2つ持つと片方だけ直る）

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
Write-Host " 4. /reservations を開く → 見出しの下に『自動更新中（最終 HH:MM:SS）』" -ForegroundColor Cyan
Write-Host " 5. 別の端末から予約を入れる → 15秒以内に画面へ出て、緑のバッジと音が出る" -ForegroundColor Cyan
