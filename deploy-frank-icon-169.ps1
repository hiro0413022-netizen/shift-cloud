# ============================================================
# #169 会員ポータルのアプリアイコンを正規ロゴに差し替え
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-icon-169.ps1
#
# migration なし。デプロイ後、ホーム画面に追加し直すとアイコンが変わります。
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/member-os/public/icon-192.png" `
  "apps/member-os/public/icon-512.png" `
  "apps/member-os/public/icon-maskable-512.png" `
  "apps/member-os/public/apple-touch-icon.png" `
  "apps/member-os/src/app/manifest.ts" `
  "sites/frank-golf/assets/brand/frank-golf-logo.jpg" `
  "docs/genesis/DECISIONS.md"

git status --short

git commit -m "feat(frank): 会員ポータルのアプリアイコンを正規ロゴに差し替え (#169)" -m @"
#155 で置いた暫定アイコン（深緑に金のF）の解消。

- HIMEJI はアイコンに入れていない（192pxで潰れて読めないため）
  FRANK GOLF + スマイル までを切り出して中央に配置
- any と maskable を別画像にした
  maskable は端末が丸や角丸に切り抜くので、同じ画像を使い回すと
  ロゴの端が欠ける（従来は icon-512 を両方に指定していた）
  any      = 白地に緑（配布素材どおり）
  maskable = 緑地に白抜き・56%に縮めて安全領域の内側へ
- ロゴの緑は実測 #16553A（公式サイトの --green-2 #1F6B41 とは別値）
- 元データを sites/frank-golf/assets/brand/ に保存
  次に別サイズが要るときLINEを遡らずに作り直せるように

未対応:
  公式サイトの favicon-32.png は金色を淡いクリーム地に置いたもので
  32pxではほぼ判読できない。ただしサイトは金×濃色の配色なので
  緑ロゴに替えるとブランドの見え方が変わる。ユーザー判断待ち。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AFrZDexNjMjDe1en5nhtvT
"@

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel のビルドを私が見ています。" -ForegroundColor Green
