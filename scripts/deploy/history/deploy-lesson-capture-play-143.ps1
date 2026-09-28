# ============================================================
# #143 Lesson OS: 撮影1ボタン化＋サムネイル即再生（migration 0120 適用済）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-lesson-capture-play-143.ps1
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "supabase/migrations/0120_lesson_video_poster.sql" `
  "apps/lesson-os/src/lib/poster.ts" `
  "apps/lesson-os/src/app/(main)/students/[id]/karte-client.tsx" `
  "apps/lesson-os/src/app/(main)/students/[id]/swing-recorder.tsx" `
  "apps/lesson-os/src/app/(main)/students/[id]/actions.ts" `
  "apps/lesson-os/src/app/(main)/students/[id]/page.tsx" `
  "apps/lesson-os/src/app/(main)/models/actions.ts" `
  "apps/lesson-os/src/app/(main)/models/models-client.tsx" `
  "apps/lesson-os/src/app/s/[token]/page.tsx" `
  "apps/lesson-os/src/app/s/[token]/share-video.tsx" `
  "apps/lesson-os/public/manual.md" `
  "docs/genesis/DECISIONS.md" `
  "NEXT_TASKS.md"

git status --short

git commit -m "lesson-os: 撮影を1ボタンで完結・一覧はサムネイルを押せばすぐ再生 (#143 / 0120)" -m @"
- 撮影: 大きな【スイングを撮影する】1つを主導線に。撮影モジュール内でクラブ/飛距離/メモ→登録まで完結
  （従来は撮影→閉じる→下までスクロール→登録、の3手が残っていた）。ファイル取り込みは折りたたみへ
- 再生: ページ表示時に createSignedUrls で全動画の再生URLを一括発行。カードに最初から video を置き、
  押せばその場で再生。描画・フェーズは【描画・フェーズ・スロー】で従来プレーヤーに差し替え
- 0120 poster_path: 登録時にcanvasで1コマ目を640px/JPEGに切り出して保存。一覧はposterだけ出し
  動画本体は preload=none＝押されるまで読まない。生成失敗でも登録は継続、null は従来表示にフォールバック
- 生徒の共有ページ /s/[token] も署名URLを一括化（記録20本+お手本6本で26往復していた）
- お手本スイングにも poster_path

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017nQhgkA9MgirJV91C6m3PJ
"@

git push origin main

Write-Host ""
Write-Host "push 完了。lesson-os が READY になったらスマホでカルテを開いてください。" -ForegroundColor Green
