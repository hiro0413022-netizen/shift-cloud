# ============================================================
# #155 会員ポータルの仕上げ（PWA・自動チェックアウト・打席QR印刷・セッション1年）
#      ＋ #154 の店舗解決バグ修正
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-portal-155.ps1
#
# ★ migration はありません（DB作業なし）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/member-os/src/lib/frank-portal.ts" `
  "apps/member-os/src/lib/member.ts" `
  "apps/member-os/src/app/layout.tsx" `
  "apps/member-os/src/app/manifest.ts" `
  "apps/member-os/src/app/member/page.tsx" `
  "apps/member-os/src/app/member/add-to-home.tsx" `
  "apps/member-os/src/app/member/order/actions.ts" `
  "apps/member-os/src/app/checkin/kiosk.tsx" `
  "apps/member-os/src/app/orders/page.tsx" `
  "apps/member-os/src/app/orders/actions.ts" `
  "apps/member-os/src/app/orders/live.tsx" `
  "apps/member-os/src/app/orders/qr/page.tsx" `
  "apps/member-os/src/components/nav.tsx" `
  "apps/member-os/public/icon-192.png" `
  "apps/member-os/public/icon-512.png" `
  "apps/member-os/public/apple-touch-icon.png" `
  "docs/genesis/DECISIONS.md" `
  "docs/modules/frank/規約_モバイルオーダー同意条項_案.md" `
  "NEXT_TASKS.md"

git status --short

git commit -m "frank: 会員ポータルをホーム画面に追加できるように＋自動チェックアウト・打席QR印刷・セッション1年 (#155)" -m @"
- ⚠ #154のバグ修正: store_id に company_id を流用していた（frunk_members.store_id が null の会員で発生）。
  frankStore() に一本化し、引けなければチェックインを失敗させる（別店舗の行を作らない）
- PWA: manifest.ts（start_url=/member）＋ apple-touch-icon ＋ theme_color。
  「ホーム画面に追加」の案内を /member に1回だけ表示（standaloneなら出さない・閉じたら記憶）
  アイコンは暫定（深緑に金のF）。ロゴをもらったら差し替える
- 会員セッションを60日→1年、残り180日を切ったら自動延長。
  cookie はサーバーコンポーネント描画中に書けないので try/catch で握り、/member/visit で揃える
- 自動チェックアウト: 予約終了+30分で来店中モードを閉じる（cronを増やさず判定だけで閉じる）。
  伝票から「退店」を押したときだけ checked_out_at が入る
- 打席QR印刷 /orders/qr: 打席1つにつき1枚。URLは開いているホストから作るのでDNS未設定でも使える
- 電子伝票のタブ見出しに未提供件数（iPadは一度タップしないと音が鳴らないため）
- 規約の同意条項の文案を docs/modules/frank/ に追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AFrZDexNjMjDe1en5nhtvT
"@

git push origin main

Write-Host ""
Write-Host "push 完了。member-os が READY になったら:" -ForegroundColor Green
Write-Host "  1) /member をスマホで開く → 「ホーム画面に追加」の案内が出るか" -ForegroundColor Green
Write-Host "  2) /orders/qr を開いて打席QRを印刷（A打席/B打席/C打席の3枚）" -ForegroundColor Green
Write-Host "  3) 印刷したQRをスマホで読む → 未ログインならビジター注文画面が出るか" -ForegroundColor Green
