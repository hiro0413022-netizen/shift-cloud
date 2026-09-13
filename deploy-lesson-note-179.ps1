# ============================================================
# #179 Lesson OS: レッスンの会話を録音してAIがメモの下書きを作る（会話メモ）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-lesson-note-179.ps1
#
# ※ migration 0131 は適用済み
# ※ デプロイ前に lesson-os の Vercel に GEMINI_API_KEY を設定してください
#    （現在は swing-cortex にしか入っていません。無くても画面は動きますが要約が出ません）
# ※ 会員規約・店頭掲示への録音の記載が済むまで、本番のお客様には使わないでください
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "supabase/migrations/0131_lesson_notes_voice.sql" `
  "apps/lesson-os/src/lib/lesson-note-ai.ts" `
  "apps/lesson-os/src/app/api/lesson-note/summarize/route.ts" `
  "apps/lesson-os/src/app/(main)/students/[id]/lesson-note.tsx" `
  "apps/lesson-os/src/app/(main)/students/[id]/actions.ts" `
  "apps/lesson-os/src/app/(main)/students/[id]/karte-client.tsx" `
  "apps/lesson-os/src/app/(main)/students/[id]/page.tsx" `
  "apps/lesson-os/public/manual.md" `
  "docs/genesis/DECISIONS.md"

git status --short

git commit -m "lesson-os: レッスンの会話を録音してAIがコメントの下書きを作る「会話メモ」 (#179)" -m @"
カルテに「会話メモ」タブを追加。録音→文字起こし→要約→コーチが確認して確定。

守っている3つ:
- 同意なしに録音は始められない（チェックを入れた時刻とスタッフを記録に残す）
- 音声は要約ができた時点で自動削除。残るのは要約とコーチが直した本文だけ
- AIは下書き。カルテと共有ページに出るのはコーチが保存したものだけ

- AIはGemini（音声をそのまま渡せるので文字起こしと要約が1回で済む）。
  swing-cortexで既に使っているキーを流用し、業者を増やさない
- 文体はそのコーチの過去コメント5件を見本に渡す（内容は真似させない）
- 会話に無いことは書かせない。私的な話は文字起こしにも要約にも入れない
- 50分の音声は数分かかるので route handler（maxDuration=300）
- 録音中に画面が消えると止まる端末があるのでWake Lockを取得。
  30分超は2本に分けるよう画面と手順書に明記

残（ユーザー作業）: lesson-osのVercelにGEMINI_API_KEY / 規約と店頭掲示への追記 / 実地の音テスト

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019tqPLjbyozp5ayJsLTALHm
"@

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel に GEMINI_API_KEY を入れてから、まず自分の声で1本試してください。" -ForegroundColor Green
