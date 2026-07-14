# Ask Data / 売上台帳取込 / 売上分析 のコミット＆デプロイ（2026-07-14）
# 実行方法:
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\commit-and-deploy.ps1

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host ""
Write-Host "[1/5] 壊れたgitインデックスを作り直します..." -ForegroundColor Cyan
Remove-Item ".git\index.lock" -Force -ErrorAction SilentlyContinue
Remove-Item ".git\index" -Force -ErrorAction SilentlyContinue
git reset --mixed | Out-Null

Write-Host "[2/5] 途中で切れたファイルが無いか検査..." -ForegroundColor Cyan
node scripts/check-files.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host "壊れたファイルが検出されました。Claudeに報告してください（コミット中止）。" -ForegroundColor Red
    exit 1
}

Write-Host "[3/5] 今回の変更だけをステージします..." -ForegroundColor Cyan
$paths = @(
    "supabase/migrations/0053_ask_data.sql",
    "supabase/migrations/0052_sales_ledger_rollup.sql",
    "packages/core/src/ask-data.ts",
    "packages/core/package.json",
    "apps/genesis/src/app/(main)/chat",
    "apps/genesis/src/components/sidebar.tsx",
    "apps/genesis/next.config.ts",
    "apps/genesis/package.json",
    "apps/shift-cloud/src/app/(staff)/chat",
    "apps/shift-cloud/src/components/staff-nav.tsx",
    "apps/shift-cloud/next.config.ts",
    "apps/shift-cloud/package.json",
    "apps/money-golfwing/src/app/(main)/analysis",
    "apps/money-golfwing/src/lib/analytics.ts",
    "apps/money-golfwing/src/components/nav.tsx",
    "scripts/import-sales-ledger.mjs",
    "package.json",
    "package-lock.json",
    "docs/genesis/DECISIONS.md",
    "docs/modules/ask-data/SYSTEM.md"
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
$msg += "feat(ask-data/money): 実データに聞くチャット＋売上台帳の自動取込＋売上分析 (DECISIONS #56/#57/#58)"
$msg += ""
$msg += "- Ask Data: LLMはSQLだけを書き、数字はPostgresが計算（生成SQLと件数を出典表示）。"
$msg += "  権限はDBが強制（gnv_*ビュー＋実体テーブル権限を持たないgn_chat_reader）。"
$msg += "  Genesis /chat（全社）と スタッフポータル /chat（自店舗のみ）。"
$msg += "- 売上台帳: npm run import:sales で xlsx→mon_sales_lines→mon_sales→fin_entries を1コマンド化。"
$msg += "  台帳の月会費は「月会費(窓口)」として保存し、月会費予測の停止トリガー誤爆を防ぐ。"
$msg += "- Money OS /analysis: 事業別・カテゴリ別・品目別・支払方法別の売上分析。"
$msgFile = Join-Path $env:TEMP "yozan_commit_msg.txt"
Set-Content -Path $msgFile -Value $msg -Encoding UTF8

git commit -F $msgFile
Remove-Item $msgFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "[5/5] push中..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。Vercelが自動ビルドします（1〜2分）" -ForegroundColor Green
Write-Host "次にやること: Vercelの yozan-genesis / shift-cloud-shift-cloud / money-golfwing に ANTHROPIC_API_KEY があるか確認"
Write-Host "（apps/reserve-os のLINE LIFF対応は前回セッションの未コミット分のため今回に含めていません）"
