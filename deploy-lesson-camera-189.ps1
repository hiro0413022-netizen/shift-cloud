# ============================================================
# #189 Lesson OS: iPhone でカメラが開かない件を直す
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-lesson-camera-189.ps1
#
# ※ migration なし（lesson-os のフロントのみ）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/lesson-os/src/app/(main)/students/[id]/swing-recorder.tsx" `
  "apps/lesson-os/public/manual.md" `
  "docs/genesis/DECISIONS.md"

git status --short

git commit -m "lesson-os: iPhoneでカメラが開かない件を直した（ホーム画面アプリはSafariと許可が別・タップ起点で開けるようにした） (#189)" -m @"
iPhone 17 Pro Max・ホーム画面のアイコンから開いて、赤いエラー文でカメラが開かなかった件。

- 原因: iOS 17以降、ホーム画面に追加したアイコンは Safari とは別の Web アプリとして動き、
  カメラ・マイクの許可を共有しない。Safari 側で許可済みでも、そちらは未許可のまま。
  さらに許可の確認はタップ起点でないと出ないことがあり、画面を開いた直後に useEffect から
  getUserMedia を呼ぶだけの実装では、確認が出ないまま NotAllowedError で落ちていた。
- 【カメラを開始】をプレビュー上に出し、タップから呼び直せるようにした
  （許可済みの端末は従来どおり自動で開くので、普段の手数は増えない）
- catch で握りつぶしていたのをやめ、DOMException の name ごとに次の一手まで書いた文を出す。
  ホーム画面アプリの iPhone のときだけ「Safari とは別あつかい／アイコンを追加し直す」まで書く
- 要求を 1920x1080@60 → 素の facingMode → 音声なし → video:true と段階的に緩める。
  マイクだけ断られる端末があり、音声込みの1回勝負だと映像まで諦めていた。
  音が録れなかったときは、インパクトの自動推定が効かない旨を画面に出す
- 許可なし・カメラ無しは緩めても直らないので、その2つは即エラー（確認ダイアログを潰さない）

検証: tsc --noEmit 通過

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017gy7FAjDQ2QmkSoEyRrrvg
"@

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel が READY になったら、iPhone で開き直して確認してください。" -ForegroundColor Green
