# ============================================================
# #162 受付リーダーの読み取りを Enter 依存から外す ＋ 設置用の診断モード
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-reader-162.ps1
#
# migration なし。デプロイ後の確認は  /checkin?debug=1  を開いて1回かざすだけ。
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/member-os/src/app/checkin/kiosk.tsx" `
  "packages/core/src/frank-token.ts" `
  "packages/core/src/frank-portal.ts" `
  "packages/core/package.json" `
  "tests/frank-portal.test.ts" `
  "docs/genesis/DECISIONS.md"

git status --short

git commit -m "feat(frank): 受付リーダーをEnter設定に依存させない＋設置用の診断モード (#162)" -m @"
リーダー接続当日に「何も起きない」の原因を切り分けられないことに気づいての先手。

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
  - テスト404件 全通過

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AFrZDexNjMjDe1en5nhtvT
"@

git push origin main

Write-Host ""
Write-Host "push 完了。member-os が READY になったら受付PCで開いてください:" -ForegroundColor Green
Write-Host "  https://my.frankgolf.jp/checkin?debug=1" -ForegroundColor Cyan
Write-Host "会員証QRを1回かざすと、画面下に読み取り結果が出ます。" -ForegroundColor Green
