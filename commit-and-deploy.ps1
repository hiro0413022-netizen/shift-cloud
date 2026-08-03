# 判断フィード: 実行プラン表示＋修正指示＋学習（#100 / migration 0090 適用済）
# 内容: ホームのAI実行カードに詳細展開（何がどう実行されるか＋LINE文面全文）、
#       AI修正/直接編集の修正指示、gn_feedbackへの学習蓄積と生成への注入
# 実行方法:
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\commit-and-deploy.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/6] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock",".git\index.lock",".git\refs\heads\main.lock",".git\MERGE_HEAD.lock",".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue

Write-Host "[2/6] 型チェック（VMのマウントIO不調で未完走のため、ここで実行）..." -ForegroundColor Cyan
Push-Location "apps\genesis"
npx tsc -p tsconfig.tscheck.json --noEmit
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host "tscエラーあり。コミットを中止しました。エラー内容をClaudeに貼ってください。" -ForegroundColor Red
    exit 1
}
Pop-Location

Write-Host "[3/6] コミット（今回の変更ファイルのみ・caddy-os等の並行作業は含めない）..." -ForegroundColor Cyan
git add apps/genesis/src supabase/migrations/0090_gn_feedback.sql `
        docs/genesis/DECISIONS.md CHANGELOG.md commit-and-deploy.ps1
git commit -m "feat(genesis): 判断フィードに実行プラン表示・修正指示(AI/直接編集)・学習蓄積(#100, 0090)"

Write-Host "[4/6] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }

Write-Host "[5/6] 統合をコミット..." -ForegroundColor Cyan
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[6/6] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。2-3分後に genesis のデプロイが終わります。" -ForegroundColor Green
Write-Host "確認手順:" -ForegroundColor Green
Write-Host "  1. ホームのAI実行カード（LINE配信など）の「詳細 — 承認すると何がどう実行されるか」を開く" -ForegroundColor Gray
Write-Host "  2. 実行内容・宛先・タイミング・送信文全文が出る" -ForegroundColor Gray
Write-Host "  3. AI修正欄に「もっと短く」等を入れて送信 → 文面が書き直されて承認待ちのまま残る" -ForegroundColor Gray
Write-Host "  4. /executions を開いてもカードは承認待ちのまま（承認するまで送信されない）" -ForegroundColor Gray
