# 体験カウンセリングシートを受付台帳へ ／ 朝のスタッフ連絡を店舗ごとに分ける（2026-09-02・#198）
# 内容:
#   1) 受付台帳（member-os のトップ）の「体験」の行に【カウンセリングを入力】ボタン。
#      紙のカウンセリングシート ①ゴルフ歴 ②練習・ラウンドの頻度 ③普段の練習場所
#      ④平均スコア ⑤改善したいこと(最大2つ) ⑥場所選びで重視すること(最大2つ) を入力できます。
#      ⑦きっかけ＝既存の「何で知ったか」、⑧知りたいこと＝既存のコメント欄をそのまま使います（二度聞かない）。
#      Excel出力（一時利用者名簿）にも9列ぶん出ます（57列のまま）。
#   2) 朝のスタッフ連絡を「店舗ごとに1通」に変更。
#      GOLF WING のグループには GOLF WING の出勤・やることだけ、FRANK には FRANK のぶんだけ。
#      LINEグループが未登録の店舗には送らず、記録だけ残します（他店へは絶対に流しません）。
#   3) 朝連絡以外の「スタッフへ連絡」も宛先を持てるようにしました。
#      ・JARVIS に「FRANKのスタッフに〜と連絡して」と言えばFRANKのグループにだけ出ます
#      ・Genesis の「スタッフへ連絡」画面は配信先が店舗名で並び、「全店に送る」を選んだときだけ両方へ
#      ・承認カードの詳細に「どの店のグループに出るか」を表示
#   4) 「スタッフへ連絡」画面の送信が積んだだけで届かない状態だったのを直しました
#      （n8n の拾い役が #102 以降なく、その場で送る方式に変更）。
# migration: なし（survey は既存の jsonb 列に入れます）
# 検証: member-os / genesis の tsc 通過・テスト561件通過（クラウドでcloneして実走）
# 実行方法: 右クリック→「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\deploy-counseling-line-198.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/4] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock", `
    ".git\MERGE_HEAD.lock", ".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/4] コミット（今回の変更ファイルのみ）..." -ForegroundColor Cyan
git add apps/member-os/src/lib/walkin.ts `
    "apps/member-os/src/app/(main)/actions.ts" `
    "apps/member-os/src/app/(main)/visit-row.tsx" `
    apps/member-os/src/app/api/ledger-export/route.ts `
    apps/genesis/src/lib/ceo-ai.ts apps/genesis/src/lib/jarvis.ts `
    apps/genesis/src/lib/judgment-feed.ts apps/genesis/src/lib/staff-notice.ts `
    "apps/genesis/src/app/(main)/notice/notice-client.tsx" `
    docs/genesis/DECISIONS.md deploy-counseling-line-198.ps1
git commit -m "frank: 体験カウンセリングシートを受付台帳に入力できるように／朝のスタッフ連絡を店舗ごとのLINEグループへ分離 (#198)"

Write-Host "[3/4] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了。Vercel の member-os / yozan-genesis のデプロイが READY になってから画面を確認してください。" -ForegroundColor Green
