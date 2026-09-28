# ============================================================
# #184 「ジェネシス」と呼べば会話に入る常時待受＋話し終わるまで待つ
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-jarvis-wake-184.ps1
#
# ※ migration なし
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/genesis/src/components/jarvis.tsx" `
  "apps/genesis/src/lib/jarvis-pure.ts" `
  "apps/genesis/src/app/globals.css" `
  "tests/jarvis.test.ts" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "deploy-dev-queue-183.ps1"

git status --short

git commit -m "genesis: 「ジェネシス」と呼べば会話に入るようにし、話し終わるまで待つようにした (#184)" -m @"
ユーザー指摘2件。どちらも正しい。

「毎回ボタンを押して話す形になっている」
  押してから話す限り "呼べば答える" にはならない。
  常時待受にして、呼びかけ（ジェネシス）が出るまでは何も拾わない。
  待受にした選択は記憶するので、次に開いたときは自動で戻る。

「喋っている最中にいきなり終了して回答してしまいます」
  continuous=false のブラウザ標準の区切りは日本語の"間"に対して短すぎ、
  言い終わる前に確定していた。録りっぱなしにして、最後の結果から
  一定時間 新しい結果が来なければ言い終わり、に変えた。
  適正値は人によるので はやい0.9/ふつう1.8/ゆっくり3.0秒 から選べる。

- 呼びかけただけで用件が無ければ送らない（一拍おいて話し始める人を切らない）
- 読み上げ中はマイクを切る。切らないと自分の声を聞いて自分に返事し続ける。
  この判定は state ではなく ref（onend のクロージャが古い値を握るため）
- Chromeは無音が続くと勝手に止まるので onend で必ず起こし直す。
  止まったまま黙るのがいちばん気づきにくい壊れ方
- 聞き取り中の言葉を画面に出す（何が聞こえているか見えないと直せない）
- 返事のあと10秒は呼びかけ不要
- 呼びかけの判定は detectWake() に切り出し、表記ゆれをテストで固定。
  ここが外れると永久に起動しないという最悪の壊れ方をする

tests 485件パス（新規8件）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uugp7HXc17XWUs1va9eCy3
"@

git push origin main

Write-Host ""
Write-Host "push 完了。READY になったらホームで【🎧 待受にする】を1回押してください。" -ForegroundColor Green
Write-Host "以後は「ジェネシス」と呼ぶだけで会話に入ります（次に開いたときも自動で待受）。" -ForegroundColor Cyan
Write-Host "まだ早く切られるようなら、右上の「待ち」を ゆっくり にしてください。" -ForegroundColor Yellow
