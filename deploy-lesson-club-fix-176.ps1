# ============================================================
# #175/#176 Lesson OS: クラブヘッド軌跡＋スイングプレーン（実動画で検証済み）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-lesson-club-fix-176.ps1
#
# ※ migration 0129 / 0130（club/plane/diag/src_fps）は適用済み
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "supabase/migrations/0130_lesson_club_plane.sql" `
  "apps/lesson-os/src/lib/pose.ts" `
  "apps/lesson-os/src/app/(main)/students/[id]/video-player.tsx" `
  "apps/lesson-os/src/app/(main)/students/[id]/actions.ts" `
  "apps/lesson-os/public/manual.md" `
  "tests/lesson-swing-analysis.test.ts" `
  ".gitignore" `
  "docs/genesis/DECISIONS.md"

git status --short

git commit -m "lesson-os: クラブヘッド軌跡とスイングプレーンを実動画で動くところまで作り直した (#175/#176)" -m @"
実機で1本も取れなかったので、実際のスイング動画を見ながら原因を特定して作り直した。

- 最大の原因: スロー撮影ではコマ間でクラブがほとんど動かず、1コマ前との差分にシャフトが写らない。
  8〜16コマ前と比べると同じ場所にくっきり出る。よって比較するコマ間隔を決め打ちにせず、
  1/2/4/8/12を試して一番きれいに出た最小の間隔を採る
- 光線に直角方向の幅を持たせた。r=200pxで1度ずれると横に3.5px外れ、細いシャフトを見失っていた
- 中心-周りのridgeで「細いもの」だけ残す（体の輪郭や背景の明滅は太い）
- 動きの閾値を固定値から画面の実測（85パーセンタイル+4）へ
- そのコマで一番強い向きを選ぶのをやめ、候補を4本出して動的計画法で1本に決める。
  「前のコマの続き」「手元からヘッドまでの距離が体格に対して一定」で一意に決まる
- 軌跡は再生位置から2秒ぶんの尾だけ描く（12秒の動画で全部描くと読めない）
- 取れなかったときは診断（解析コマ数→手元→向きの候補→線として残った数）を画面とDBに残す

検証: 実動画363コマ中246コマでヘッドを検出。アドレス〜テークバック〜トップ〜フォローまで
線が乗ることを画で確認済み。tests 20件（新規）・全457件パス

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019tqPLjbyozp5ayJsLTALHm
"@

git push origin main

Write-Host ""
Write-Host "push 完了。READY になったら同じ動画で【解析し直す】を押してください。" -ForegroundColor Green
