# member-os: 店舗ダッシュボードの「入会者数」を受付台帳込みの暫定表示に（2026-08-16）
# 内容: GOLF WING宝塚の月次サマリーで、入会者数＝会員名簿（エクセル取込）＋受付台帳の「成約=入会」。
#       氏名/カナで突き合わせるので、名簿を取り込むと台帳側は自動で落ちる（二重に数えない）。
#       内訳チップは「名簿」「受付台帳（暫定）」の2つ。会員純増も暫定値に追随。
#       FRANK GOLF姫路はこの画面を使わない（入会はGenesis側が正）。テスト7件＋既存354件通過済み。
# 実行方法: 右クリック→「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\deploy-member-os-join-tally.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/4] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock", `
    ".git\MERGE_HEAD.lock", ".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/4] コミット（今回の変更ファイルのみ）..." -ForegroundColor Cyan
git add "apps/member-os/src/app/(main)/dashboard/page.tsx" `
    apps/member-os/src/lib/join-tally-pure.ts `
    tests/join-tally.test.ts `
    deploy-member-os-join-tally.ps1
git commit -m "member-os: 店舗ダッシュボードの入会者数を受付台帳込みの暫定表示に（名簿取込までのつなぎ）"

Write-Host "[3/4] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。2-3分後に member-os のデプロイが終わります。" -ForegroundColor Green
Write-Host "確認: https://member-os-tau.vercel.app/dashboard → 2026年08月の「入会者数」が 2 件（暫定：名簿 0 ＋ 受付台帳 2）になること" -ForegroundColor Gray
Start-Sleep -Seconds 90
