# 日次レポート停止（60秒タイムアウト）の修正 コミット＆デプロイ（2026-07-17）
# 実行方法:
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\commit-and-deploy.ps1
#
# 注意: このファイルは必ず「BOM付きUTF-8」で保存すること。
# Windows PowerShell 5.1 はBOMが無い .ps1 をCP932として読むため、日本語が化けて構文エラーになる。

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host ""
Write-Host "[1/5] 壊れたgitインデックスを作り直します..." -ForegroundColor Cyan
Remove-Item ".git\index.lock" -Force -ErrorAction SilentlyContinue
Remove-Item ".git\HEAD.lock" -Force -ErrorAction SilentlyContinue

Write-Host "[2/5] 途中で切れたファイルが無いか検査..." -ForegroundColor Cyan
node scripts/check-files.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host "壊れたファイルが検出されました。Claudeに報告してください（コミット中止）。" -ForegroundColor Red
    exit 1
}

Write-Host "[3/5] 今回の変更だけをステージします..." -ForegroundColor Cyan
$paths = @(
    "apps/genesis/src/lib/ceo-ai.ts",
    "apps/genesis/src/app/api/cron/daily/route.ts",
    ".gitattributes",
    "scripts/check-files.mjs",
    "commit-and-deploy.ps1",
    "fix-line-endings.ps1"
)
foreach ($p in $paths) { git add -- $p }

Write-Host "[4/5] ステージ内容:" -ForegroundColor Cyan
git diff --cached --stat

$ans = Read-Host "この内容でコミットしてpushしますか？ (y/n)"
if ($ans -ne "y") {
    Write-Host "中止しました（ステージは残っています）"
    exit 0
}

# コミットメッセージはファイル経由（PowerShellのヒアストリングを避ける）
$msg = @()
$msg += "fix(genesis/cron): 日次レポートの60秒タイムアウトを解消＝レポートを先に保存する"
$msg += ""
$msg += "2026-07-15朝を最後に日次レポートが欠落。/api/cron/daily が毎回504"
$msg += "(Vercel Runtime Timeout 60s)。#60で成果物の自動生成が入り、レポートINSERTの前に"
$msg += "Claude呼び出しが直列で10回以上走るようになったのが原因。INSERTは処理の最後なので"
$msg += "レポートが丸ごと残らなかった。"
$msg += ""
$msg += "- runDailyCeoReport: 返信下書き/法務抽出/証憑OCR/成果物生成をレポート保存後の"
$msg += "  後工程 runDailyAfterwork() に移動。時間切れでもレポートだけは必ず残る。"
$msg += "- 後工程は DAILY_AFTERWORK_BUDGET_MS (既定180秒) の予算内で優先度順に実行し、"
$msg += "  超過分は静かに打ち切り (次回実行や10分tickで拾う)。"
$msg += "- /api/cron/daily の maxDuration を 60 から 300 秒へ。"
$msg += "- .gitattributes: 改行コードをLFに統一 (VMマウントのCRLF末尾欠落の根治)。"
$msg += "- check-files.mjs: 自分自身のコメント内のU+FFFDで誤検知し常にexit 1になっていたのを修正。"
$msgFile = Join-Path $env:TEMP "yozan_commit_msg.txt"
Set-Content -Path $msgFile -Value $msg -Encoding UTF8

git commit -F $msgFile
Remove-Item $msgFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "[5/5] push中..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。Vercelが自動ビルドします（1〜2分）" -ForegroundColor Green
Write-Host "続けて .\fix-line-endings.ps1 を実行してください（毎回の手動デプロイが不要になります）" -ForegroundColor Yellow
