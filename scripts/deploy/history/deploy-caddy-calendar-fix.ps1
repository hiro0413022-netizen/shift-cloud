# Caddy OS シフトカレンダー「既に割り当て済みです」の修正（2026-08-22）
# 使い方: cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\deploy-caddy-calendar-fix.ps1

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/3] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/3] コミット..." -ForegroundColor Cyan
git add -- "apps/caddy-os/src/app/actions.ts" "apps/caddy-os/src/app/calendar/board.tsx" "CHANGELOG.md"
git commit -m "caddy-os: calendar assign now updates tentative->confirmed instead of rejecting as duplicate" -m @"
- assignDispatch: 同日×同キャディが仮なら確定へ更新、確定済みなら冪等、別ゴルフ場で確定済みなら明示エラー
- 重複判定は従来どおり partner_id/staff_id + dispatch_date（取消・削除は除外）。日付だけでは判定しない
- calendar/board: 成功・失敗にかかわらず router.refresh()、割当済キャディを選ぶと［確定］ボタンに切替、追加後に選択をクリア
- tsc 通過

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PLBMfYtSYxnZfik1J275yN
"@

Write-Host "[3/3] push（Vercel が caddy-os を自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。caddy-os のデプロイ READY 後、/calendar で 仮で追加 → 確定 が通ります。" -ForegroundColor Green
