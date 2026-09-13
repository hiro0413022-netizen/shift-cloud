# 予約変更の理由表示 ／ 体験予約ページの曜日ズレ修正 ／ 通知に「何が届いたか」を出す（2026-09-03・#200 + #201）
# 内容:
#   ■ #200
#   1) 予約の「日時・打席を変更」で保存できなかったとき、**理由を画面に出す**ようにしました。
#      例)「9/8 は定休日・休業日のため予約を入れられません」
#          「A打席は 9/4 14:00〜15:00 に別のご予約が入っています」
#      これまでは何も出ずに元の画面へ戻るだけで、保存できたのか失敗したのか分かりませんでした。
#   2) 変更できたときは**変更後の日のカレンダーへ移動**し、緑の帯で内容を出します。
#   3) お客様へのメールが送れなくても、予約の変更は成功のまま返します。
#   4) 体験予約ページ（frankgolf.jp）の曜日が1日ずれていたのを修正（9/2 水 →「火」と表示）。
#      **日付そのものは正しく入っているので予約の取り直しは不要**です。
#   ■ #201
#   5) 音が鳴ったときに**何が届いたのかを1行で表示**します。
#      「体験 ／ 9/5(土) 13:00 ／ 岸田 拓也 様 ／ C打席」
#      「注文 ／ A打席 ／ 福島 晃 様 ／ コーヒー×1・トースト×2 ／ 14:32」
#      直近5件は消さずに残ります（見逃してもあとから読めます）。
#      出る画面: 予約 ／ 体験申込 ／ 電子伝票
# migration: なし
# デプロイされるVercelプロジェクト: member-os（予約・体験申込・電子伝票）／frank-golf（体験予約ページ）
# 検証: member-os の tsc と next build 通過・テスト571件通過（クラウドでcloneして実走）
# 実行方法: 右クリック→「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\deploy-booking-and-notice-200-201.ps1

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
    "apps/member-os/src/app/(main)/trials/page.tsx" `
    apps/member-os/src/app/orders/page.tsx apps/member-os/src/app/orders/live.tsx `
    apps/member-os/src/components/live-refresh.tsx `
    apps/member-os/src/lib/live-feed-pure.ts apps/member-os/src/lib/frank-reservation.ts `
    sites/frank-golf/trial-booking.html sites/frank-golf/_build.py `
    tests/frank-site-weekday.test.ts tests/live-feed.test.ts `
    docs/genesis/DECISIONS.md deploy-booking-and-notice-200-201.ps1
git commit -m "frank: 予約変更の拒否理由を画面に出す・体験予約ページの曜日ズレ修正 (#200) ／ 通知に何が届いたかを1行で出す (#201)"

Write-Host "[3/4] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了。member-os と frank-golf が READY になったら、予約画面と電子伝票をご確認ください。" -ForegroundColor Green
