# ============================================================
# #154 FRANK 会員ポータル（my.frankgolf.jp）＋QRチェックイン＋モバイルオーダー
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-portal-154.ps1
#
# ★ migration 0123 は本番適用済み（2026-08-26・MCP）。DB作業は不要です。
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

npm install

git add -- `
  "supabase/migrations/0123_frank_member_portal.sql" `
  "packages/core/package.json" `
  "packages/core/src/frank-portal.ts" `
  "tests/frank-portal.test.ts" `
  "apps/member-os/package.json" `
  "package-lock.json" `
  "apps/member-os/src/middleware.ts" `
  "apps/member-os/src/components/nav.tsx" `
  "apps/member-os/src/lib/frank-portal.ts" `
  "apps/member-os/src/lib/frank-square.ts" `
  "apps/member-os/src/app/member/page.tsx" `
  "apps/member-os/src/app/member/visit-panel.tsx" `
  "apps/member-os/src/app/member/visit/route.ts" `
  "apps/member-os/src/app/member/order/page.tsx" `
  "apps/member-os/src/app/member/order/order-form.tsx" `
  "apps/member-os/src/app/member/order/actions.ts" `
  "apps/member-os/src/app/member/settings/page.tsx" `
  "apps/member-os/src/app/member/settings/actions.ts" `
  "apps/member-os/src/app/bay" `
  "apps/member-os/src/app/checkin" `
  "apps/member-os/src/app/orders" `
  "apps/genesis/src/lib/frank-pos.ts" `
  "docs/genesis/DECISIONS.md" `
  "NEXT_TASKS.md" `
  "docs/modules/frank/MEMBER_PORTAL_構想.md" `
  "docs/modules/frank/CHECKIN_QR_構想まとめ.md"

git status --short

git commit -m "frank: 会員ポータル＋QRチェックイン＋モバイルオーダー (#154)" -m @"
- 会員ポータル: お客様の入口を1つに。既存の /member を育てて 会員証QR/予約/カルテ/注文/公式LINE/設定 を1画面に集約
- QRチェックイン: 会員証QRを受付リーダーで読む→来店確定＋打席確定＋frunk_bookings を visited に自動更新
  トークンは frunk_members.checkin_token（数字＋英大文字16桁・0/O/1/I/L 除く）。会員番号は連番なので使わない
  受け口は POST /checkin/api の1本に集約＝将来リーダーを仮想COMに替えても画面/DB/ロジックは不変
  自社トークンの形でないスキャンは黙って捨てる（卓上リーダーは何でも読む）
- 来店中モード: かざした瞬間にお客様のスマホが自動で切り替わる（/member/visit をポーリング）
- モバイルオーダー: 注文＝即決済（保存カード・idempotency_key は注文ID＝二重課金しない）
  カード未保存/決済失敗でも注文は止めず「未決済」で伝票に出す（退店時にレジ）
- 打席QR /bay/<code>: 会員用とビジター用を分けない1本。ログイン状態で自動分岐
- 電子伝票 /orders（受付iPad）: 打席順・提供済み・口頭注文の追加・音つき通知
- 受付チェックイン画面 /checkin（客側PC）: 氏名/プラン/打席＋声かけカード。手動チェックインつき
- Money OS: Webhook に tryRecordMobileOrder を追加し category='店内飲食'＋品目の内訳で記帳
- migration 0123（frunk_checkins / frunk_menu_items(24品) / frunk_orders / frunk_order_items）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AFrZDexNjMjDe1en5nhtvT
"@

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel(member-os / yozan-genesis) が READY になったら:" -ForegroundColor Green
Write-Host "  1) /member を開いて会員証QRが出るか" -ForegroundColor Green
Write-Host "  2) /checkin をスタッフでログインして開き、QRの16桁を手打ち+Enter でチェックインできるか" -ForegroundColor Green
Write-Host "  3) /orders に伝票が並ぶか" -ForegroundColor Green
