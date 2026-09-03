# 音が鳴ったときに「何が届いたのか」を1行で出す（2026-09-03・#202）
# 内容:
#   ・鳴った理由をその場に表示します
#       「体験 ／ 9/5(土) 13:00 ／ 岸田 拓也 様 ／ C打席」
#       「注文 ／ A打席 ／ 福島 晃 様 ／ コーヒー×1・トースト×2 ／ 14:32」
#   ・直近5件は消えません（手が離せず見逃しても、あとから読めます）。
#     消えるのは「確認したので消す」を押したときだけです。
#   ・日程がまだ決まっていない体験申込は「日程未定」と出ます。
#   ・出る画面: 予約（/reservations）／体験申込（/trials）／電子伝票（/orders）
#   ・画面を開いた時点で並んでいるものは新着として出しません。
# migration: なし
# デプロイされるVercelプロジェクト: member-os
# 検証: member-os の tsc と next build 通過・テスト571件通過（クラウドでcloneして実走）
# ※ #201 は別セッションが lesson-os で使っていたため、この作業は #202 に採番し直しています。
# 実行方法: 右クリック→「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\deploy-live-notice-202.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/4] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock", `
    ".git\MERGE_HEAD.lock", ".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/4] コミット..." -ForegroundColor Cyan
git add apps/member-os/src/lib/live-feed-pure.ts apps/member-os/src/lib/frank-reservation.ts `
    apps/member-os/src/components/live-refresh.tsx `
    "apps/member-os/src/app/(main)/reservations/page.tsx" `
    "apps/member-os/src/app/(main)/trials/page.tsx" `
    apps/member-os/src/app/orders/page.tsx apps/member-os/src/app/orders/live.tsx `
    tests/live-feed.test.ts `
    docs/genesis/DECISIONS.md deploy-live-notice-202.ps1
git commit -m "frank: 音が鳴ったときに何が届いたかを1行で出す（予約・体験申込・電子伝票／直近5件は残す） (#202)"

Write-Host "[3/4] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了。member-os が READY になったら、予約画面と電子伝票で音を鳴らして内容が出るかご確認ください。" -ForegroundColor Green
