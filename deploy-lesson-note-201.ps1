# 会話メモ・計測を「本日のレッスン」に紐づける／お客様への説明もAIが書く（2026-09-03・#201）
# 内容:
#   1) 本日のレッスンの先頭に【前回のレッスンで話したこと】（直したこと・宿題・次回みるところ）
#   2) スイング動画の下に、その日の会話メモ（先生の記録＋お客様への説明）と計測（レッスンデータ）
#   3) 会話メモの「確認して保存」1回で、先生の記録・お客様への説明・動画への紐づけをまとめて確定
#   4) お客様への説明は、AIが今日の会話からお客様向けの文章で下書き（保存するまで出ません）
#   5) 計測の保存時に「本日のレッスンに紐づける」（既定＝その日の最後のスイング）
#   6) お客様の画面は、紐づいた計測がある日だけレッスンデータを8項目＋前回比で表示
#   7) 待ち時間対策: 録音しながら送る／要約は裏で走る／会話メモはタブを移っても閉じない
# migration: 0142_lesson_note_video_link.sql（**本番へ適用済み**。このpushはコードのみ）
# 検証: lesson-os の tsc --noEmit 通過
# 実行方法: 右クリック→「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\deploy-lesson-note-201.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/4] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock", `
    ".git\MERGE_HEAD.lock", ".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/4] コミット（今回の変更ファイルのみ）..." -ForegroundColor Cyan
git add supabase/migrations/0142_lesson_note_video_link.sql `
    "apps/lesson-os/src/app/(main)/students/[id]/actions.ts" `
    "apps/lesson-os/src/app/(main)/students/[id]/karte-client.tsx" `
    "apps/lesson-os/src/app/(main)/students/[id]/lesson-note.tsx" `
    "apps/lesson-os/src/app/(main)/students/[id]/measure-panel.tsx" `
    "apps/lesson-os/src/app/(main)/students/[id]/page.tsx" `
    "apps/lesson-os/src/app/s/[token]/page.tsx" `
    apps/lesson-os/src/lib/lesson-note-ai.ts `
    apps/lesson-os/src/lib/trackman.ts `
    apps/lesson-os/src/app/api/lesson-note/summarize/route.ts `
    docs/genesis/DECISIONS.md deploy-lesson-note-201.ps1
git commit -m "lesson-os: 会話メモと計測を本日のレッスンに紐づけ／お客様への説明をAI生成／生成の待ち時間を短縮 (#201)"

Write-Host "[3/4] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了。Vercel の lesson-os が READY になってから、カルテを開いてご確認ください。" -ForegroundColor Green
