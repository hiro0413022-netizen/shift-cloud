# ============================================================
# #170 レッスンページの写真をららプロの実写に差し替え
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-lesson-photo-170.ps1
#
# 公式サイトの再生成は実行済み（lesson.html / facility.html に反映済み）。
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "sites/frank-golf/assets/img/lesson-rara-wide.jpg" `
  "sites/frank-golf/assets/site-data.js" `
  "sites/frank-golf/_build.py" `
  "sites/frank-golf/lesson.html" `
  "sites/frank-golf/facility.html" `
  "docs/genesis/DECISIONS.md"

git status --short

git commit -m "fix(frank-golf): レッスンページの写真がサンプルのままだった (#170)" -m @"
ユーザー指摘。lesson.html の主役写真がサンプルのままだった。

原因:
  前回トップのLESSONを差し替えたとき images.lessonPic は実写にしたが、
  images.lesson は hero-3.jpg（サンプル）のまま残っていた。
  この2つは別キーで、lesson.html と館内ギャラリーは後者を見ていた。

変更:
  - lesson-rara-wide.jpg を追加（1200x800）
    元画像は1200x1200の正方形で media() の枠は3:2。
    中央クロップだとコーチの頭が切れるので y=120 から切り、
    両者の顔とボールに置いた手が入る構図にした
  - site-data.js の images.lesson を差し替え
  - _build.py のフォールバック src も修正
    assets/img/lesson.jpg は実体が料理写真（images.food が指している）で、
    JSが動かない環境ではレッスンページに料理写真が出る状態だった

未対応:
  play（打席）/ lounge（バー）/ community / concept はサンプルのまま。
  実写が撮れたら site-data.js の images を差し替えること。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AFrZDexNjMjDe1en5nhtvT
"@

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel のビルドを私が見ています。" -ForegroundColor Green
