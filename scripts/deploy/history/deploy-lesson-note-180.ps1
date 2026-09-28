# ============================================================
# #180 会話メモ: 失敗理由を画面に出す（#179 の追い足し）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-lesson-note-180.ps1
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/lesson-os/src/lib/lesson-note-ai.ts" `
  "apps/lesson-os/src/app/api/lesson-note/summarize/route.ts" `
  "docs/genesis/DECISIONS.md"

git status --short

git commit -m "lesson-os: 会話メモが失敗したとき、理由を画面に出す (#180)" -m @"
「要約できませんでした」だけだと、モデル名違い・キー不正・音声形式・上限超過の
どれなのか現場で切り分けられないため。

- Geminiが2xxを返さなかったら HTTPステータスと本文の先頭300字を error に残して画面に出す
- 本文が空なら status=failed にして音声を消さない（原因を直して要約し直せる）
- モデル名を LESSON_NOTE_MODEL で差し替え可能に（音声対応モデルが変わっても再デプロイ不要）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019tqPLjbyozp5ayJsLTALHm
"@

git push origin main

Write-Host ""
Write-Host "push 完了。READY になったら、ご自身の声で1〜2分だけ録って試してください。" -ForegroundColor Green
