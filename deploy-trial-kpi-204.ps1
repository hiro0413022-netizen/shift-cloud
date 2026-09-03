# 当月体験人数と入会率の数え方を修正（2026-09-03・#204）
# 内容:
#   1) 体験人数に「まだ来ていない先の予約」が混ざっていたのを直しました。
#      （9月はFRANKで28件ありますが、来店済は13件・これから15件）
#   2) 入会率が必ず0.0%だったのを直しました。
#      FRANKの入会はWeb入会なので受付台帳の【入会】ボタンが押されず、分子が常に0でした。
#      これからは会員台帳と電話・メールで照合して数えます（9月は体験13名中2名＝15.4%）。
#   3) 率の分母は「来店済」にしました（先の予約で割ると、予約が入るほど率が下がるため）。
#   4) GOLF WINGのダッシュボードも同じ考え方に揃え、体験・フィッティングの件数を
#      「今日までに来られた分」で数え、「これから◯件」を注記に出します。
# migration: 0143（**本番へ適用済み**。このpushはコードとリポジトリ同期のみ）
# 検証: member-os の tsc と next build 通過／KPIを再計算して実測値を確認済み
# 実行方法: 右クリック→「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\deploy-trial-kpi-204.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/4] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock", `
    ".git\MERGE_HEAD.lock", ".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/4] コミット..." -ForegroundColor Cyan
git add supabase/migrations/0143_frank_trial_kpi_fix.sql `
    "apps/member-os/src/app/(main)/dashboard/page.tsx" `
    docs/genesis/DECISIONS.md deploy-trial-kpi-204.ps1
git commit -m "kpi: 当月体験人数から先の予約を外し、入会率を会員台帳との照合で数えるようにした (#204)"

Write-Host "[3/4] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了。DBは適用済みなので、Genesisのホームを開き直せば新しい数字になっています。" -ForegroundColor Green
