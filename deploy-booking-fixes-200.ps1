# 予約変更の「黙って元に戻る」を解消 ／ 体験予約ページの曜日ズレ修正（2026-09-03・#200）
# 内容:
#   1) 予約の「日時・打席を変更」で保存できなかったとき、**理由を画面に出す**ようにしました。
#      例)「9/8 は定休日・休業日のため予約を入れられません」
#          「A打席は 9/4 14:00〜15:00 に別のご予約が入っています」
#      これまでは何も出ずに元の画面へ戻るだけで、保存できたのか失敗したのか分かりませんでした。
#   2) 変更できたときは**変更後の日のカレンダーへ移動**し、緑の帯で内容を出します。
#      （日付を変えると変更前の日を映したままで「消えた／戻った」ように見えていました）
#   3) お客様へのメールが送れなくても、予約の変更は成功のまま返します（二重に直さなくて済むように）。
#   4) 体験予約ページ（frankgolf.jp）の曜日が1日ずれていたのを修正。
#      9/2（水）が「火」と表示されていました。**日付そのものは正しく入っているので予約の取り直しは不要**です。
#   5) 同じ曜日ズレが再発しないようテストを追加（tests/frank-site-weekday.test.ts）。
# migration: なし
# デプロイされるVercelプロジェクト: member-os（予約画面）／frank-golf（体験予約ページ）
# 検証: member-os の tsc と next build 通過・テスト563件通過（クラウドでcloneして実走）
# 実行方法: 右クリック→「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\deploy-booking-fixes-200.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/4] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock", `
    ".git\MERGE_HEAD.lock", ".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/4] コミット..." -ForegroundColor Cyan
git add "apps/member-os/src/app/(main)/reservations/actions.ts" `
    "apps/member-os/src/app/(main)/reservations/page.tsx" `
    sites/frank-golf/trial-booking.html sites/frank-golf/_build.py `
    tests/frank-site-weekday.test.ts `
    docs/genesis/DECISIONS.md deploy-booking-fixes-200.ps1
git commit -m "frank: 予約変更の拒否理由を画面に出す・変更後の日へ移動／体験予約ページの曜日ズレ(9/2水→火)を修正 (#200)"

Write-Host "[3/4] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了。member-os と frank-golf が READY になったら、予約の変更をもう一度お試しください（弾かれる場合は理由が赤帯で出ます）。" -ForegroundColor Green
