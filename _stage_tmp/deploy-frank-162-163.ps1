# ============================================================
# #162 受付リーダーを Enter 設定に依存させない ＋ 設置用の診断モード
# #163 予約が無いチェックインが「日付が変わるまで来店中」だった穴を塞ぐ
# #164 退店ボタンを押す場所が無かった（打席なしの来店に出ていなかった）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-162-163.ps1
#
# migration なし。デプロイ後の確認は  /checkin?debug=1  を開いて1回かざすだけ。
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/member-os/src/app/checkin/kiosk.tsx" `
  "apps/member-os/src/lib/frank-portal.ts" `
  "apps/member-os/src/app/orders/page.tsx" `
  "apps/member-os/src/app/orders/actions.ts" `
  "packages/core/src/frank-token.ts" `
  "packages/core/src/frank-portal.ts" `
  "packages/core/package.json" `
  "tests/frank-portal.test.ts" `
  "docs/genesis/DECISIONS.md"

git status --short

git commit -m "feat(frank): 受付リーダーをEnter設定に依存させない＋来店中まわりの穴を塞ぐ (#162/#163/#164)" -m @"
#162 リーダー接続当日に「何も起きない」の原因を切り分けられないことへの先手。

これまで:
  隠し入力欄にフォーカスを当て Enter を待つ形。
  (1) Suffix=Enter が未設定 (2) フォーカスが外れている
  のどちらでも同じ「無反応」になり、リーダーの故障と区別がつかなかった。

変更:
  - window の keydown を直接拾う（フォーカスが外れていても読める）
  - 最後の1文字から140ms静かなら Enter が来なくても送る
    ＝リーダーの Suffix 設定に関係なく動く
  - /checkin?debug=1 で 生の文字列/文字数/所要ms/Enterの有無/却下理由 を表示
    1文字も出ない=未認識、化けている=キーボード配列、16文字でnotfound=別環境のQR
  - トークンの文字集合を packages/core/src/frank-token.ts に切り出した
    frank-portal.ts は node:crypto を読むのでクライアントから読めないため。
    画面側にコピーを作ると診断表示だけが嘘をつくので、定義は1か所に保つ

#163 予約が無いチェックイン（ビジター・飛び込み）が日付が変わるまで
     「来店中」のままだった。帰宅後もスマホに打席が出て、
     店外から注文画面を開けてしまう。

  - 予約あり → 終了+30分、予約なし → チェックイン+2時間 で閉じる
  - 判定を visitClosed() に切り出してテストで固定
  - 時刻が取れないときは「閉じない」。誤って閉じると打席にいる客が
    注文できなくなり、しかも誰も気づけない（#161と同じ壊れ方）

#164 退店ボタンが打席カードの中にしか無く、打席が決まっていない来店
     （予約なしで来た会員）は押す場所がどこにも無かった。本番で発生。

  - 伝票の一番上に「来店中」の帯を置き、打席の有無に関わらず1行ずつ出す
  - 各行に 名前/会員番号/時刻/打席(未設定なら選択ボタン)/退店
  - 打席カード内の小さい退店ボタンは外した（入口は1か所に決める）
  - 伝票からも打席を割り当てられるようにした（受付画面は客側を向いているため）

テスト409件 全通過。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AFrZDexNjMjDe1en5nhtvT
"@

git push origin main

Write-Host ""
Write-Host "push 完了。member-os が READY になったら受付PCで開いてください:" -ForegroundColor Green
Write-Host "  https://my.frankgolf.jp/checkin?debug=1" -ForegroundColor Cyan
Write-Host "会員証QRを1回かざすと、画面下に読み取り結果が出ます。" -ForegroundColor Green
