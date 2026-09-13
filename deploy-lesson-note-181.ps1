# ============================================================
# #181 会話メモ × AIカルテナレッジ（症状タグ＋お客様への説明文）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-lesson-note-181.ps1
#
# ※ migration 0132 は適用済み
# ※ #180（失敗理由の表示）をまだ push していない場合も、この1回で両方入ります
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "supabase/migrations/0132_lesson_note_symptoms.sql" `
  "apps/lesson-os/src/lib/lesson-note-ai.ts" `
  "apps/lesson-os/src/app/api/lesson-note/summarize/route.ts" `
  "apps/lesson-os/src/app/(main)/students/[id]/lesson-note.tsx" `
  "apps/lesson-os/src/app/(main)/students/[id]/actions.ts" `
  "apps/lesson-os/src/app/(main)/students/[id]/page.tsx" `
  "apps/lesson-os/src/app/s/[token]/page.tsx" `
  "apps/lesson-os/public/manual.md" `
  "docs/genesis/DECISIONS.md"

git status --short

git commit -m "lesson-os: 会話メモを店のメソッドに紐づける。AIには分類だけさせる (#180/#181)" -m @"
「ナレッジから近いのを検索してコメント生成だとナレッジの意味がない」というユーザーの指摘は正しい。
言い回しの辞書に使うと、コーチが既に言ったことを別の言葉に置き換えるだけで、
コーチの言葉が失われるぶん悪化する。向きを逆にした。

  音声   = 事実（コーチと生徒が言ったこと。言い換えない）
  ナレッジ = 翻訳先（症状ID・確認項目IDを付ける／お客様向け説明文を差し出す）
  本文   = コーチの言葉のまま

これでナレッジが意味を持つ:
- 症状IDが付いて初めて、取り込み済み28,842件と同じ土俵に今日のレッスンが乗る
  （「この生徒はすくい打ちが3か月で4回」が数えられる）
- お客様向け説明は sc_knowledge.client_explanation が持っている＝コーチは書かなくていい
- どの症状にも当たらない表現は「うちのメソッドに無い言葉」としてナレッジを育てる材料

- AIが返したIDが自社の一覧に無ければ捨てる（発明した症状をDBに入れない）
- コーチの○×は消さずに rejected で残す（外れ方を直す材料）
- 紐づけは音声とは別のテキスト呼び出し（文字起こしをやり直さずタグだけ付け直せる）
- 共有ページに出るのは share_body だけ。文字起こしもAIの下書きもお客様には出さない
- #180: 失敗時のHTTPステータスを画面に出す／本文が空なら音声を消さない

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019tqPLjbyozp5ayJsLTALHm
"@

git push origin main

Write-Host ""
Write-Host "push 完了。録音→要約すると、症状タグが自動で付きます。" -ForegroundColor Green
Write-Host "違うタグはタップで外してください（外した記録もAIの改善に使います）。" -ForegroundColor Yellow
