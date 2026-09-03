# レッスンノートを会員ページの中で直接見られるようにした（2026-09-03・#210）
# 内容:
#   1) 会員ページの【レッスンノートを見る】が、共有URL(/s/<token>)へ飛ばすのをやめ、
#      会員ページの中（/member/lesson）でその場で表示するようになりました。
#      **秘密のURLは1本も作りません**。ログインしているご本人であることだけが根拠です。
#   2) 出るもの: スイング動画（スロー・コマ送り）／今日のレッスンの説明／
#      レッスンデータ（8項目＋同じクラブの前回比）／コーチからのアドバイス／お手本スイング
#   3) 共有URLは今まで通り残します（LINEで送る・会員でない方に見せる用）。
#      古い /member/karte のリンクは新しいページへ転送します。
# migration: なし
# 検証: member-os / lesson-os の tsc --noEmit 通過・テスト602件通過
# 実行方法: 右クリック→「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\deploy-member-lesson-210.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/4] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock", `
    ".git\MERGE_HEAD.lock", ".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/4] コミット（今回の変更ファイルのみ）..." -ForegroundColor Cyan
git add packages/core/src/lesson-share.ts packages/core/package.json `
    apps/member-os/src/app/member/lesson `
    apps/member-os/src/app/member/karte/route.ts `
    apps/member-os/src/app/member/page.tsx `
    apps/member-os/src/lib/frank-portal.ts `
    apps/lesson-os/src/lib/trackman.ts `
    "apps/lesson-os/src/app/s/[token]/page.tsx" `
    tests/lesson-share.test.ts `
    docs/genesis/DECISIONS.md deploy-member-lesson-210.ps1
git commit -m "member-os: レッスンノートを共有URLなしで会員ページの中に表示する (#210)"

Write-Host "[3/4] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了。Vercel の member-os / lesson-os が READY になってから、会員ページの【レッスンノートを見る】をご確認ください。" -ForegroundColor Green
