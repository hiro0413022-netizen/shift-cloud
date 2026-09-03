# FRANK: 来店を押さなくても来店として扱う（2026-09-03・#205）
# 内容:
#   1) 予約は**終了時刻を過ぎたら自動的に「来店」**になります（判定は10分ごと）。
#      ・当日ぶんもその日のうちに来店になります（まだ打っている方は対象外）
#      ・キャンセル／無断欠／来店済には触りません（押した事実は上書きしません）
#      ・GOLF WING は対象外です
#   2) 体験は申込側も「来店済」にそろえ、受付台帳にも来店時刻が入ります（打刻の代わり）。
#   3) 【無断欠】を押すと受付台帳から下がります（体験人数に混ざらないように）。
#      来店に戻せばまた載ります。
#   4) 予約画面に「【来店】は押さなくて大丈夫。来られなかった方だけ【無断欠】」と表示します。
#   ※ 9/3 18:08 時点で終わっていた分（予約11件・体験申込10件・台帳10行）は**すでに反映済み**です。
# migration: なし
# デプロイされるVercelプロジェクト: yozan-genesis（cron）／member-os（予約画面）
# 検証: genesis / member-os の tsc と next build 通過・テスト571件通過
# 実行方法: 右クリック→「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\deploy-frank-auto-visited-205.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/4] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock", `
    ".git\MERGE_HEAD.lock", ".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/4] コミット..." -ForegroundColor Cyan
git add apps/genesis/src/lib/frank-visit-cron.ts `
    apps/genesis/src/app/api/cron/daily/route.ts apps/genesis/src/app/api/cron/execute/route.ts `
    "apps/member-os/src/app/(main)/reservations/actions.ts" `
    "apps/member-os/src/app/(main)/reservations/page.tsx" `
    docs/genesis/DECISIONS.md deploy-frank-auto-visited-205.ps1
git commit -m "frank: 来店を押さなくてもレッスン終了時刻を過ぎたら来店にする（10分ごと判定・無断欠は台帳から下げる） (#205)"

Write-Host "[3/4] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了。デプロイ後、レッスンが終われば最大10分で来店が付きます。" -ForegroundColor Green
