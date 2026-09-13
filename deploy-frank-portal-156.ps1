# ============================================================
# #156 会員ポータルの運用まわり
#      注文の二度押し防止 / メニュー管理 / 会員カードの来店 / カルテ新着バッジ
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-portal-156.ps1
#
# ★ migration 0124 は本番適用済み（2026-08-26・MCP）。DB作業は不要です。
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "supabase/migrations/0124_frank_karte_seen.sql" `
  "apps/member-os/src/lib/frank-portal.ts" `
  "apps/member-os/src/app/member/page.tsx" `
  "apps/member-os/src/app/member/karte/route.ts" `
  "apps/member-os/src/app/member/order/order-form.tsx" `
  "apps/member-os/src/app/orders/page.tsx" `
  "apps/member-os/src/app/orders/menu/page.tsx" `
  "apps/member-os/src/app/orders/menu/actions.ts" `
  "apps/member-os/src/app/(main)/frunk/[id]/page.tsx" `
  "docs/genesis/DECISIONS.md"

git status --short

git commit -m "frank: 注文の二度押し防止・メニュー管理・会員カードの来店・カルテ新着バッジ (#156)" -m @"
- ⚠ 注文ボタンの二度押しを止めた。会員の注文はその場でカード課金が走るので、
  連打すると注文も決済も2件できる（idempotency_key は注文IDごとなので守れない）
- メニュー管理 /orders/menu: 売り切れトグル・価格(一般/会員)・メニューからの出し入れ。
  行は消さず active で出し入れ（過去の伝票の紐付けを壊さない）
  価格は Square のカタログと同じ値に保つこと（画面にも警告を出した）
- 会員カード /frunk/<id> に「来店」: 今月/通算の回数・前回来店(14日以上空いたら黄色)・直近12件
- レッスンカルテの新着バッジ（0124 karte_seen_at）。
  Lesson OS が稼働しなかった理由が「書いても生徒に届かない」ことだったので、ポータルで知らせる。
  リンク先を /member/karte にして既読を記録＋共有トークンをHTMLに埋めない
- ダッシュボードの来店KPIは見送り（データが貯まる前に置くと0が並ぶだけ）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AFrZDexNjMjDe1en5nhtvT
"@

git push origin main

Write-Host ""
Write-Host "push 完了。member-os が READY になったら:" -ForegroundColor Green
Write-Host "  1) /orders/menu を開いて売り切れトグルが効くか（/member/order に反映されるか）" -ForegroundColor Green
Write-Host "  2) /frunk/<会員> に「来店」パネルが出るか" -ForegroundColor Green
Write-Host "  3) /member でカルテボタンに「新着」が付くか（動画がある会員で）" -ForegroundColor Green
