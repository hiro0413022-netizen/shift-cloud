# 未コミット一式のコミット＆デプロイ（2026-07-19）
# 内容: FRANK GOLF公式サイト(#66-#71)・体験/Web入会(#72)・JST日付統一/RUNBOOK4本/NWマップ同期(#73)
# 実行方法:
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\commit-and-deploy.ps1
#
# 注意: このファイルは必ず「BOM付きUTF-8」で保存すること。
# Windows PowerShell 5.1 はBOMが無い .ps1 をCP932として読むため、日本語が化けて構文エラーになる。

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host ""
Write-Host "[1/6] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\index.lock" -Force -ErrorAction SilentlyContinue
Remove-Item ".git\HEAD.lock" -Force -ErrorAction SilentlyContinue

Write-Host "[2/6] リモートの先行コミット(f2b0190)にインデックスを同期..." -ForegroundColor Cyan
# ローカルはorigin/mainより1コミット遅れ。作業ツリーの内容はf2b0190を含んでいるため
# reset(mixed)でHEAD/indexだけをorigin/mainへ合わせる（ファイルは触らない＝安全）
git fetch origin
git reset origin/main

Write-Host "[3/6] 途中で切れたファイルが無いか検査..." -ForegroundColor Cyan
node scripts/check-files.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Host "壊れたファイルが検出されました。Claudeに報告してください（コミット中止）。" -ForegroundColor Red
    exit 1
}

Write-Host "[4/6] 変更を全てステージします..." -ForegroundColor Cyan
git add -A

Write-Host "[5/6] ステージ内容:" -ForegroundColor Cyan
git diff --cached --stat | Select-Object -Last 15

$ans = Read-Host "この内容でコミットしてpushしますか？ (y/n)"
if ($ans -ne "y") {
    Write-Host "中止しました（ステージは残っています）"
    exit 0
}

$msg = @()
$msg += "feat: FRANK GOLF公式サイト+体験/Web入会+JST日付統一+RUNBOOK4本+NWマップ同期 (#66-#73)"
$msg += ""
$msg += "- sites/frank-golf: 公式HP15ページ(#66-#71)。料金/住所/コーチ確定、SEO/MEO、体験導線"
$msg += "- member-os: 公開の体験申込 /trial と Web入会 /join-web、スタッフ /trials(#72, migration 0068適用済)"
$msg += "- genesis: サーバー日付をJSTへ統一(lib/jst.ts)。日次レポートのタイトルが毎朝1日ズレていた問題を"
$msg += "  解消(6:00 JST cron=前日21:00 UTC)。sp_tasks日付/提案dedupe/当月判定も同修正(#73)"
$msg += "- RUNBOOK 4本(money/survey/reserve/caddy)を作成し各アプリ /manual で配信、ログイン画面にリンク(C-1完了)"
$msg += "- network: survey/caddy/demo-sales/reserve-osのURL・状態を実態同期、FRANK GOLFノード+フロー図追加"
$msg += "- tests: jst-dates.test.ts 追加(64件全緑)"
$msgFile = Join-Path $env:TEMP "yozan_commit_msg.txt"
Set-Content -Path $msgFile -Value $msg -Encoding UTF8

git commit -F $msgFile
Remove-Item $msgFile -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "[6/6] push中..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。Vercelが自動ビルドします（1〜2分）" -ForegroundColor Green
