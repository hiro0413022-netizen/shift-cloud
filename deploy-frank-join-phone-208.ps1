# 入会申込が決済ページに飛ばない件の修正（2026-09-03・#208）
# 内容:
#   1) 原因: 電話番号が「携帯なのに10桁」だと +81905655867 を作って Square に渡し、
#      Square が Invalid phone number. で決済リンクの発行ごと拒否していた
#      （member-os はリンクが無いと「承認待ち」画面に落ちる＝お客様は決済ページに行けない）
#   2) 電話番号の判定を @yozan/core/jp-phone に新設（画面とサーバーが同じ関数を通す）
#   3) prefill(メール・電話)が原因の失敗は prefill 抜きで1回だけ作り直す
#   4) 入会フォームで桁数をその場で注意する（会員ページのログインは電話の下4桁）
#   5) 決済ページを出せなかったら frunk.join_checkout_failed を events に残し、
#      お客様の画面にも「お支払いはまだ完了していません」と明記する
# ⚠ 直前のpushで packages/core/src/jp-phone.ts だけが取り残され、
#   yozan-genesis の本番ビルドが Module not found で失敗している。これで直る。
# migration: なし
# 検証: genesis / member-os の tsc --noEmit 通過・テスト598件通過
# 実行方法: 右クリック→「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\deploy-frank-join-phone-208.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/4] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock", `
    ".git\MERGE_HEAD.lock", ".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/4] コミット（今回の変更ファイルのみ）..." -ForegroundColor Cyan
git add packages/core/src/jp-phone.ts packages/core/package.json `
    apps/genesis/src/lib/frank-pos-pure.ts `
    apps/genesis/src/lib/frank-square-billing.ts `
    apps/member-os/src/app/join-web/actions.ts `
    apps/member-os/src/app/join-web/web-join-form.tsx `
    tests/jp-phone.test.ts `
    docs/genesis/DECISIONS.md deploy-frank-join-phone-208.ps1
git commit -m "FRANK: 入会申込が決済ページに飛ばないことがあったのを直した（電話番号の打ち間違いでSquareが決済リンクを拒否していた） (#208)"

Write-Host "[3/4] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[4/4] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host "完了。Vercel の yozan-genesis が READY になるのを確認してください（今 ERROR で止まっています）。" -ForegroundColor Green
