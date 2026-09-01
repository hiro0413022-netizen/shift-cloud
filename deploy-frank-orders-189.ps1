# ============================================================
# #189 FRANK 予約の会員検索（お名前でも）＋ 注文の通知音を長く・大きく・3分で鳴らし直し
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-orders-189.ps1
#
# ※ migration はありません
# ※ コミットは作成済みです。残っていれば追加でコミットし、push します
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/member-os/src/lib/frank-reservation.ts" `
  "apps/member-os/src/app/(main)/reservations/member-picker.tsx" `
  "apps/member-os/src/app/(main)/reservations/page.tsx" `
  "apps/member-os/src/app/(main)/reservations/actions.ts" `
  "apps/member-os/src/app/orders/live.tsx" `
  "apps/member-os/src/app/orders/page.tsx" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "NEXT_TASKS.md" `
  "deploy-frank-orders-189.ps1"

git status --short

# すでにコミット済みなら commit は飛ばす（$ErrorActionPreference="Stop" で止まらないように）
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "コミット済みのため commit は飛ばします。" -ForegroundColor Yellow
} else {
git commit -m "FRANK: 予約の会員をお名前で探せるようにし、注文の通知音を長く・大きく・3分で鳴らし直すようにした (#189)" -m @"
ユーザー依頼:
  スタッフがPCで打席予約を取るとき、会員番号だけでなく名前でも検索できるように。
  お客様から注文が入ったときの音が短すぎる。もっと長く大きく。
  注文から提供済みにするまで3分たったらもう一度鳴らして。

1. 会員番号を覚えていないと予約が取れなかった
   予約作成は「会員番号（会員時）」の欄だけで、電話で「山田です」と言われたら
   別タブで会員管理を開いて番号を調べて戻る運用になっていた。
   お名前・カナ・会員番号・電話のどれでも当たる候補ドロップダウンにした。

2. 当たり判定は増やさない
   /frunk と同じ frunk-member-search（純関数・テスト済み）をそのまま使う。
   ここで別の検索を書くと「会員管理では出るのに予約では出ない」が起きる。

3. 候補はサーバーからまとめて渡して画面で絞る
   1文字ごとに問い合わせると、電話を受けながら打つ速さに追いつかない。
   候補は active と suspended だけ（退会・却下は選び間違えるだけなので出さない）。

4. 選んだ会員は id で送り、サーバーで会社・店舗を引き直す
   表示名で送ると同姓同名を取り違える。画面の値はそのまま信じない。
   旧フォームの member_no も受け続ける。

5. 「区分」の選択欄を廃止
   会員を選んだかどうかで自動的に決まる。
   選び忘れて会員が都度利用として登録される事故の芽を消す。

6. 通知音は 0.35秒のピッ1回では気づけなかった
   約2.4秒のチャイム6連にし、音量を 0.25 -> 0.9 に。
   triangle波は sine より倍音があり、同じ音量でも通る。

7. 未提供のまま3分たったら鳴らし直す
   最初の1回を聞き逃すと、以降は誰も気づけないまま伝票が残る。
   鳴らし直しは低い音で新着と聞き分けられるようにし、
   何件たまっていても鳴らすのは1回（連打すると誰も聞かなくなる）。
   判定は10秒の再描画に乗せず自前の15秒タイマーで回す。

8. 音と同じ基準を画面にも出す
   未提供の伝票に「注文時刻／経過◯分」、3分超はカードごと赤。
   音ONの横にテスト再生（注文を待たずに音量を確かめられる）。

member-os の tsc --noEmit 通過・next build 通過（クラウドでcloneして実走）
tests 518件パス

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SYYxiYDnAPCBuWmmM4KoUj
"@
}

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel が READY になったら次の順で確認してください。" -ForegroundColor Green
Write-Host " 1. /reservations の「予約を作成」で 会員 欄に「やまだ」や「FR00」と打つ → 候補が出る" -ForegroundColor Cyan
Write-Host " 2. 選んで登録 → 予約一覧に『会員』として出る" -ForegroundColor Cyan
Write-Host " 3. 受付iPadで /orders →【音をONにする】（1回鳴ります）→【テスト再生】で音量を確認" -ForegroundColor Cyan
Write-Host " 4. 1品注文 → 長いチャイム → 提供済みにせず3分待つ → 低い音で鳴り直し・カードが赤くなる" -ForegroundColor Cyan
Write-Host ""
Write-Host "ブラウザから出せる音量は上限まで上げてあります。足りなければ iPad の音量と外付けスピーカーをご検討ください。" -ForegroundColor Yellow
