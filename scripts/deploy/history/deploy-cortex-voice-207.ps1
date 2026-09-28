# AIカルテナレッジ 音声メモ＋ナレッジの提案（2026-09-03・#207）
# 内容:
#   1) 画面上部に録音バー（同意チェック → 録音 → 止める）。**録音したまま症状を検索できる**
#   2) 止めると裏でAIが下書きを作る（PGA NOTE に貼るコメント＋先生の手元の記録）
#   3) 【記録】タブで下書きを直して保存。保存したものだけが記録として残る
#   4) 音声は要約が取れた時点で自動で消える（文字起こしも手で消せる）
#   5) 設定に【ナレッジの提案】。**別々の日に3回以上出てきた指導だけ**が並び、
#      「採用する」を押したときにだけナレッジに入る（自動追加はしない）
# migration: 0145_cortex_voice_note.sql（**本番へ適用済み**。このpushはコードのみ）
# 検証: tsc --noEmit 通過／next build 通過（クラウドで実走）／テスト592件通過
# 実行方法: 右クリック→「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\deploy-cortex-voice-207.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/4] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock", `
    ".git\MERGE_HEAD.lock", ".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/4] コミット（今回の変更ファイルのみ）..." -ForegroundColor Cyan
git add supabase/migrations/0145_cortex_voice_note.sql `
    apps/swing-cortex/src/lib/candidates.ts `
    apps/swing-cortex/src/lib/voice-note-ai.ts `
    "apps/swing-cortex/src/app/(main)/note-actions.ts" `
    "apps/swing-cortex/src/app/(main)/voice-bar.tsx" `
    "apps/swing-cortex/src/app/(main)/layout.tsx" `
    "apps/swing-cortex/src/app/(main)/nav.tsx" `
    "apps/swing-cortex/src/app/(main)/note/page.tsx" `
    "apps/swing-cortex/src/app/(main)/note/note-client.tsx" `
    "apps/swing-cortex/src/app/(main)/settings/candidate-actions.ts" `
    "apps/swing-cortex/src/app/(main)/settings/candidates-client.tsx" `
    "apps/swing-cortex/src/app/(main)/settings/page.tsx" `
    apps/swing-cortex/src/app/api/voice-note/summarize/route.ts `
    tests/swing-cortex-candidates.test.ts `
    docs/modules/swing-cortex/VOICE_NOTE.md `
    docs/genesis/DECISIONS.md NEXT_TASKS.md deploy-cortex-voice-207.ps1
git commit -m "cortex: 音声メモを載せ、ナレッジは自動追加ではなく候補→人が採用する形にした (#207)"

Write-Host "[3/4] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了。Vercel の swing-cortex が READY になってから、GEMINI_API_KEY を設定してお試しください。" -ForegroundColor Green
