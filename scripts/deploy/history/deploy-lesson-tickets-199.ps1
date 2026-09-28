# パーソナルレッスンのチケット ／ 9月入会に2枚プレゼント ／ 会員ページで購入・枚数確認（2026-09-03・#199）
# 内容:
#   1) 9月入会（一般プラン）の方にパーソナル25分チケットを2枚プレゼント。
#      ・既に9月入会の方には投入済み（FR0009 木之下様。他の9月入会5名はスタッフプランのため対象外）
#      ・これ以降の9月入会は、承認した瞬間／Web入会の入金が確定した瞬間に自動で付きます
#   2) 会員ページに【レッスンチケット】。残り枚数・購入・履歴。
#      ・カード登録済み → その場で決済してすぐ使えます
#      ・カード未登録   → お申し込みだけ残り、次回ご来店時に受付でお支払い（受領を押すまで使えません）
#   3) スタッフ側は会員カードに 残枚数／履歴／【受領】／【付与】／【1枚使う】。
#   4) 打席予約のパーソナルレッスンを確定すると自動で1枚引き、その予約は「チケット1枚」表示（二重請求しない）。
#      お断り・取り消しで戻ります。
# migration: 0141_frank_lesson_tickets.sql（**本番へ適用済み**。このpushはコードのみ）
# 検証: member-os / genesis の tsc と next build 通過・テスト561件通過（クラウドでcloneして実走）
# 実行方法: 右クリック→「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\deploy-lesson-tickets-199.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/4] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock", `
    ".git\MERGE_HEAD.lock", ".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/4] コミット（今回の変更ファイルのみ）..." -ForegroundColor Cyan
git add supabase/migrations/0141_frank_lesson_tickets.sql `
    packages/core/src/frank-lesson-tickets.ts packages/core/package.json `
    apps/member-os/src/lib/frank-tickets.ts `
    apps/member-os/src/app/member/tickets `
    apps/member-os/src/app/member/page.tsx `
    "apps/member-os/src/app/(main)/frunk/actions.ts" `
    "apps/member-os/src/app/(main)/frunk/[id]/page.tsx" `
    "apps/member-os/src/app/(main)/reservations/actions.ts" `
    "apps/member-os/src/app/(main)/reservations/page.tsx" `
    apps/genesis/src/lib/frank-join.ts `
    docs/genesis/DECISIONS.md deploy-lesson-tickets-199.ps1
git commit -m "frank: パーソナルレッスンのチケット（9月入会2枚プレゼント・会員ページで購入と残枚数・予約確定で自動消費） (#199)"

Write-Host "[3/4] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了。Vercel の member-os / yozan-genesis が READY になってから、会員ページの【レッスンチケット】をご確認ください。" -ForegroundColor Green
