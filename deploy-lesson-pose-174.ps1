# ============================================================
# #174 Lesson OS: ボーン（骨格）表示
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-lesson-pose-174.ps1
#
# ※ migration 0129 は適用済み（Supabase 本番に反映済み）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "supabase/migrations/0129_lesson_pose.sql" `
  "apps/lesson-os/src/lib/pose.ts" `
  "apps/lesson-os/src/app/(main)/students/[id]/video-player.tsx" `
  "apps/lesson-os/src/app/(main)/students/[id]/actions.ts" `
  "apps/lesson-os/scripts/prepare-mediapipe.mjs" `
  "apps/lesson-os/next.config.ts" `
  "apps/lesson-os/package.json" `
  "apps/lesson-os/public/manual.md" `
  "package-lock.json" `
  ".gitignore" `
  "docs/genesis/DECISIONS.md"

git status --short

git commit -m "lesson-os: スイング動画から骨格（ボーン）を解析して重ねられるようにした (#174)" -m @"
- 撮り終わった動画をブラウザでコマ送り解析（MediaPipe Pose Landmarker / wasm）。33関節を動画に重ねる。
  リアルタイム解析はスマホで15〜25fpsまで落ちてコマを落とすため、撮影後の後処理にした
- 肩の傾き・腰の傾き・ねじれ・前傾・頭のブレ（アドレス比／肩幅を100%）を表示。
  単眼カメラなので2D投影であることを画面と手順書に明記した（同じ生徒の前回との差で読む）
- 結果は lsn_video_pose に保存（0129）。lsn_videos の列にしないのは1本数百KBで一覧が重くなるため
- wasm/モデル計10MBはリポジトリに入れず、scripts/prepare-mediapipe.mjs が build 前に用意する。
  取得に失敗してもビルドは止めず実行時にCDNへ落ちる
- 署名URLのまま canvas に描くと汚染されるので fetch→Blob→objectURL に落としてから解析する
- serverActions.bodySizeLimit を 4mb に（骨格データ最大約400KB）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019tqPLjbyozp5ayJsLTALHm
"@

git push origin main

Write-Host ""
Write-Host "push 完了。lesson-os が READY になったら カルテ→動画→【再生・描画をひらく】→【🦴 骨格を解析】を試してください。" -ForegroundColor Green
