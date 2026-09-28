# ============================================================
# #183 開発依頼キューを「クラウドが実装 → PCが取り込む」で回す
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-dev-queue-183.ps1
#
# ※ migration 0134 は適用済み
# ※ push 後、合言葉を1回だけ置いてください（NEXT_TASKS A-183）:
#     New-Item -ItemType Directory -Force "$env:USERPROFILE\.yozan" | Out-Null
#     Set-Content -NoNewline "$env:USERPROFILE\.yozan\dev-queue.key" "<CRON_SECRETの値>"
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "supabase/migrations/0134_dev_queue_patch.sql" `
  "apps/genesis/src/lib/dev-queue-auth.ts" `
  "apps/genesis/src/app/api/dev-queue/pending/route.ts" `
  "apps/genesis/src/app/api/dev-queue/applied/route.ts" `
  "apps/genesis/src/app/(main)/dev-requests/page.tsx" `
  "apps/genesis/src/middleware.ts" `
  "apply-dev-queue.ps1" `
  "deploy-genesis-jarvis-182.ps1" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "NEXT_TASKS.md"

git status --short

git commit -m "genesis: 開発依頼をクラウドが実装し、PCが取り込む形にした (#183)" -m @"
#182 のスケジュールタスクは端末接続の承認が下りず（案内も出ず）、クラウドでしか動けなかった。

実測して分かったこと:
  リポジトリはpublicなのでクラウドから clone でき、npm install も通り、
  npm test 477件も apps/genesis の tsc --noEmit も完走する。
  できないのは push だけ（2026-08-17 / proxy 403）。

よって役割を割り直した:
  クラウド … clone → 実装 → tsc + テスト → git diff をパッチとして書き戻す
  PC      … .\apply-dev-queue.ps1 を1回 → pull → git apply --3way → commit → push

#182 の「実装を起こす権限は全部AIに渡し、本番に出す権限だけ人に残す」は変えていない。
変わったのは、夜のうちに実装が進むようになったこと。

- 合言葉はリポジトリに置かない（publicなので）。
  ps1 は %USERPROFILE%\.yozan\dev-queue.key から読み、
  APIは DEV_QUEUE_SECRET（無ければ CRON_SECRET）と突き合わせる。
  どちらも未設定なら開けっぱなしにせず503で閉じる。
- 検証が通っていないパッチ（verified が空）は pending が返さない。
- git apply に失敗した依頼は blocked に戻す
  （done のまま放置すると毎回同じパッチで失敗し続ける）。
- 作業ツリーが汚れていたら止まる（人の途中作業を巻き込まない）。
- パッチはLFのまま書く。core.quotepath=false（日本語ファイル名）・--binary。

migration 0134 / tests 477件パス

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uugp7HXc17XWUs1va9eCy3
"@

git push origin main

Write-Host ""
Write-Host "push 完了。デプロイ後、合言葉を1回だけ置いてください:" -ForegroundColor Green
Write-Host '  New-Item -ItemType Directory -Force "$env:USERPROFILE\.yozan" | Out-Null' -ForegroundColor Cyan
Write-Host '  Set-Content -NoNewline "$env:USERPROFILE\.yozan\dev-queue.key" "<CRON_SECRETの値>"' -ForegroundColor Cyan
Write-Host ""
Write-Host "確認: .\apply-dev-queue.ps1 -DryRun （取り込み待ちが0件と出れば疎通OK）" -ForegroundColor Yellow
