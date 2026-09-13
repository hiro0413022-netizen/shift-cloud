# ============================================================
# #175 Lesson OS: クラブヘッド軌跡＋スイングプレーン自動計測
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-lesson-club-plane-175.ps1
#
# ※ migration 0129 / 0130 は適用済み（Supabase 本番に反映済み）
# ※ #174（骨格）をまだ push していない場合は、この1回で両方入ります
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "supabase/migrations/0129_lesson_pose.sql" `
  "supabase/migrations/0130_lesson_club_plane.sql" `
  "apps/lesson-os/src/lib/pose.ts" `
  "apps/lesson-os/src/app/(main)/students/[id]/video-player.tsx" `
  "apps/lesson-os/src/app/(main)/students/[id]/actions.ts" `
  "apps/lesson-os/scripts/prepare-mediapipe.mjs" `
  "apps/lesson-os/next.config.ts" `
  "apps/lesson-os/package.json" `
  "apps/lesson-os/public/manual.md" `
  "tests/lesson-swing-analysis.test.ts" `
  "package-lock.json" `
  ".gitignore" `
  "docs/genesis/DECISIONS.md"

git status --short

git commit -m "lesson-os: クラブヘッド軌跡とスイングプレーンの自動計測を追加 (#175)" -m @"
- ヘッドは直接追わず、両手首を原点にした放射状スキャンでシャフトの向きを取り、その先端をヘッドとみなす。
  ヘッドは60fpsで1コマ60〜80cm動き帯状にブレるため、点としては存在しない
- 確からしさが低いコマは線を飛ばす（滑らかにつないで嘘をつかない）。UIでも濃さで表現
- プレーンはアドレスの手×動き出した最初の確かなコマのヘッドで自動作図。
  外れたときは線ツールで引いた直線を基準にでき、手動は解析し直しても優先される
- 角度は必ずpx換算で計算するよう修正（正規化のままだと9:16の動画で角度が狂っていた・#174のバグ）
- プレーンの符号は線を左→右に揃えてから測る（右から左に引くと上下が反転していた）
- requestVideoFrameCallback で元動画の実測fpsを表示。解析コマ数に120（スロー撮影用）を追加
- 保存は lsn_video_pose に club / plane / src_fps を足すだけ（0130）

tests/lesson-swing-analysis.test.ts 15件追加・全452件パス

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019tqPLjbyozp5ayJsLTALHm
"@

git push origin main

Write-Host ""
Write-Host "push 完了。READY になったら カルテ→動画→【再生・描画をひらく】→【🦴 解析する】を試してください。" -ForegroundColor Green
Write-Host "まず普段どおりの動画で1本、次に iPhone純正カメラのスローモーションで撮った動画で1本お願いします。" -ForegroundColor Yellow
