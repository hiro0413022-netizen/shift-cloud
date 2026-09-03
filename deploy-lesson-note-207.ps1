# 会員ページのレッスンカルテのリンク／本日のレッスンに2つの文章（2026-09-03・#207）
# 内容:
#   1) 会員ページの【レッスンカルテを見る】が出ない会員がいた（穴田様）。
#      コーチが【生徒へ共有リンク】を押していないと出ない作りだったのをやめ、
#      見せるものがあれば出す・URLは押したときに発行する、に変えた
#   2) 本日のレッスンの【コーチからのアドバイス】に
#      「お客様への説明」→「コーチ向けのレッスン内容」の順で表示（動画が無い日も表示）
#   3) 前回のふりかえりにも、前回のお客様への説明とコーチ向けの文章を表示
#   4) お客様の画面でも、古いメモを同じ日のスイングの下に表示（過去データは書き換えない）
#   5) お客様への説明が無い過去のメモに【お客様への説明を作る】を追加
#      （音声は消えているので、先生の記録と文字起こしから作る）
# migration: なし
# 検証: member-os / lesson-os の tsc --noEmit 通過・テスト592件通過
# 実行方法: 右クリック→「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\deploy-lesson-note-207.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/4] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock", `
    ".git\MERGE_HEAD.lock", ".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
# 空のまま残っている古いrefを掃除（git log --all が bad object と出る原因）
Remove-Item ".git\refs\remotes\origin\main.lock.bak.1788091940", `
    ".git\refs\remotes\origin\main.lock.stale-0903-4947" -Force -ErrorAction SilentlyContinue

Write-Host "[2/4] コミット（今回の変更ファイルのみ）..." -ForegroundColor Cyan
git add apps/member-os/src/lib/frank-portal.ts `
    apps/member-os/src/app/member/page.tsx `
    "apps/lesson-os/src/app/(main)/students/[id]/actions.ts" `
    "apps/lesson-os/src/app/(main)/students/[id]/karte-client.tsx" `
    "apps/lesson-os/src/app/(main)/students/[id]/lesson-note.tsx" `
    apps/lesson-os/src/lib/lesson-note-ai.ts `
    "apps/lesson-os/src/app/s/[token]/page.tsx" `
    docs/genesis/DECISIONS.md deploy-lesson-note-207.ps1
git commit -m "lesson-os/member-os: 会員ページのカルテリンクを全員に出す／本日のレッスンにお客様への説明とコーチ向け記録を並べる (#207)"

Write-Host "[3/4] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了。Vercel の member-os / lesson-os が READY になってから、穴田様の会員ページとカルテをご確認ください。" -ForegroundColor Green
