# ============================================================
# #168 生徒向けマイページのブランド出し分け
#      （FRANKの会員に GOLF WING と出ていた・小川さん指摘）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-lesson-brand-168.ps1
#
# migration なし。
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/lesson-os/src/lib/brand.ts" `
  "apps/lesson-os/src/app/s/[token]/page.tsx" `
  "docs/genesis/DECISIONS.md"

git status --short

git commit -m "fix(lesson-os): 生徒向けマイページのブランドを所属店舗で出し分ける (#168)" -m @"
小川さんからLINEで指摘。FRANK GOLF の会員が共有URLを開くと
右上とフッターに GOLF WING と出ていた。

原因:
  lsn_students は2店が同居している台帳なのに、共有ページが
  ブランド名を直書きしていた。直書きは必ずどちらかの店で嘘になる。
  #134 でデータは店舗ごとに分けたが、表示のほうが残っていた。

変更:
  - apps/lesson-os/src/lib/brand.ts を追加し store_id で出し分け
  - 店名だけでなくヘッダーの色も変える
    FRANK は深緑 #1F6B41（公式サイトの --green-2 と同じ値）
    名前だけ直して青いままだと、結局よそのお店の画面に見える
  - store_id 未設定は GOLF WING 扱い（lib/auth.ts と同じ判断）
  - タブのタイトルも generateMetadata で上書き
    ルートレイアウトが GOLF WING Lesson OS 固定だったため

未対応:
  ログイン画面の表記（スタッフ用・両店共通）
  お客様に見せているURLが lesson-os.vercel.app のままである点

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AFrZDexNjMjDe1en5nhtvT
"@

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel のビルドを私が見ています。" -ForegroundColor Green
