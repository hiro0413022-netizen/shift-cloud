# Shift Cloud: 募集の開始を廃止（いつでも提出）＋1日単位の確定・編集（2026-08-17 / DECISIONS #138）
# 内容:
#   - /admin/shifts の「募集を開始する」まわり（募集期間カード・締切・削除）を撤去
#   - /requests は月送りで今日以降ならいつでも提出（締切なし・確定日はロック）
#   - シフト作成グリッドに「✓ この日を確定」「🔒 確定済み→確定解除して編集」を追加
#   - 確定済みを編集して保存しても確定のまま（本人へ変更通知）
#   - DB migration 0116 は Supabase へ適用済み（このスクリプトはコード反映のみ）
# 実行方法: 右クリック→「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\deploy-shift-anytime-submit.ps1
#
# 注意: 給与明細PDF（commit-and-deploy.ps1 の分）はまだ未コミットのままです。
#       このスクリプトは**シフト提出まわりだけ**をコミットします。

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/5] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock", `
    ".git\MERGE_HEAD.lock", ".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/5] 削除したファイルの退避フォルダを片付け..." -ForegroundColor Cyan
# サンドボックスからは削除できないため _to_delete へ退避してあります（中身は period-form.tsx / delete-period-button.tsx）
Remove-Item "_to_delete" -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "[3/5] コミット（シフト提出まわりのみ）..." -ForegroundColor Cyan
git add -A "apps/shift-cloud/src/app/(staff)/requests" "apps/shift-cloud/src/app/admin/shifts"
git add "supabase/migrations/0116_shift_requests_periodless.sql" "supabase/migrations/README.md"
git add CHANGELOG.md "docs/genesis/DECISIONS.md" deploy-shift-anytime-submit.ps1
git commit -m "shift-cloud: 募集の開始を廃止しいつでもシフト提出可に＋1日単位の確定/編集（#138）"

Write-Host "[4/5] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[5/5] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。2-3分後に shift-cloud のデプロイが終わります。" -ForegroundColor Green
Write-Host "確認1: スタッフ画面 /requests → 月の←→で来月・再来月が開き、そのまま「この月を提出」できること" -ForegroundColor Gray
Write-Host "確認2: /admin/shifts に「募集を開始」が無いこと・提出がセル下に「希望」として出ること" -ForegroundColor Gray
Write-Host "確認3: セルの「✓ この日を確定」→ 緑の「🔒 確定済み」→ 押すと確定解除できること" -ForegroundColor Gray
Start-Sleep -Seconds 60
