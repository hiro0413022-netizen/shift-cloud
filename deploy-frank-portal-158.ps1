# ============================================================
# #158 規約への同意条項の組込＋レジ商品の価格確定
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-portal-158.ps1
#
# ★ migration なし。my.frankgolf.jp は Vercel に追加済み（残りはDNSのCNAME 1本）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/member-os/src/lib/frank-terms.ts" `
  "apps/member-os/src/app/join-web/web-join-form.tsx" `
  "apps/member-os/src/app/join-web/actions.ts" `
  "scripts/frank-square-setup.mjs" `
  "sites/frank-golf/_build.py" `
  "sites/frank-golf/terms.html" `
  "sites/frank-golf/tokushoho.html" `
  "sites/frank-golf/trial-booking.html" `
  "docs/genesis/DECISIONS.md" `
  "docs/modules/frank/MEMBER_PORTAL_構想.md" `
  "NEXT_TASKS.md"

git status --short

git commit -m "frank: 会員規約に第9条(会員ポータル・モバイルオーダー)を追加＋入会フォームに決済同意＋レジ商品の価格確定 (#158)" -m @"
- 会員規約: 第9条(会員ポータル・モバイルオーダー)を追加。注文＝登録カードへの請求の同意、
  取消・返金、QR再発行、カード情報はSquare保持、障害時は店頭で継続。旧9/10条は繰り下げ
  member-os の frank-terms.ts と 公式サイト terms.html(_build.py) の両方＝食い違いを作らない
- 特商法(tokushoho.html)の支払時期にモバイルオーダーを追記
- 入会フォーム: 決済の同意は規約同意と分けた独立チェックボックス consent_mobile_order（サーバー側でも必須）
- Squareカタログ投入スクリプトに ビジター利用料5,500/体験3,300/レッスン単発(25分)2,500 を追加
  （ユーザー確定値・税込。物販は後日。反映は scripts/frank-square-setup.mjs の再実行）
- my.frankgolf.jp は Vercel(member-os) に追加済み。残りはお名前.comの CNAME 1本

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AFrZDexNjMjDe1en5nhtvT
"@

git push origin main

Write-Host ""
Write-Host "push 完了。member-os が READY になったら /join-web に決済同意のチェックが増えています。" -ForegroundColor Green
Write-Host "レジ商品の反映: SQUARE_ACCESS_TOKEN を環境変数に入れて node scripts/frank-square-setup.mjs" -ForegroundColor Green
