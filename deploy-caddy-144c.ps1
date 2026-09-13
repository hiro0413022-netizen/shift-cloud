# ============================================================
# #144c Caddy OS 「派遣一覧が0件」の真因を修正
#
#   migration 0118 で cad_dispatches.confirmed_by -> staff(id) が増え、
#   staff への外部キーが staff_id と confirmed_by の2本になった。
#   その結果 PostgREST の staff(name) が「どちらの関係か決められない」で
#   クエリごとエラーになり、error を捨てていたため画面には「0件」とだけ出ていた。
#   （データは無傷。2026-01〜09 で 332 件そのまま）
#
#   - staff!cad_dispatches_staff_id_fkey(name) に固定（該当5か所）
#   - getDispatches / getMonthBoard は error を握りつぶさず throw する
#
# 使い方: 右クリック →「PowerShellで実行」
# migration なし（コード反映のみ）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/3] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/3] コミット..." -ForegroundColor Cyan
git add -- "apps/caddy-os/src" "docs/genesis/DECISIONS.md"
git status --short
git commit -m "caddy-os: 派遣台帳が0件になる真因を修正（staffへの外部キー2本でembedが壊れていた） (#144c)" -m @"
小川さん報告「派遣一覧が0件と出る」「カレンダーにキャディ名とゴルフ場が出ない」

原因:
  migration 0118 (#140) で cad_dispatches.confirmed_by -> staff(id) が増え、
  staff への外部キーが staff_id と confirmed_by の2本になった。
  この状態で PostgREST に staff(name) と書くと「どちらの関係か決められない」で
  クエリ全体がエラーになる。呼び出し側が const { data } = await ... と
  error を捨てていたため data=null -> [] となり、画面には「0件」とだけ出ていた。
  データは1件も欠けていない（2026-01〜09で332件）。8/19以降ずっと壊れていた。

修正:
  - STAFF_EMBED = "staff!cad_dispatches_staff_id_fkey(name)" に集約して関係名を固定
    （getDispatches / getMonthBoard / api/v1/dispatches / api/v1/exports / masters）
  - getDispatches と getMonthBoard は error を throw する。
    台帳が黙って空になるより、はっきり落ちて気づけるほうが安全

教訓:
  - 外部キーを足すと、その親テーブルを embed している既存クエリが全部壊れる
  - const { data } = await ... で error を捨てると、障害が「0件」という正常な見た目に化ける

検証: caddy-os の tsc クリーン。migrationなし。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MBuDuUE2LNoKMb18weRNs9
"@

Write-Host "[3/3] push（Vercel が caddy-os を自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。2-3分でデプロイされます。" -ForegroundColor Green
Write-Host "確認: /dispatches の一覧が 2026-08 で12件、カレンダーにキャディ名とゴルフ場が出ること" -ForegroundColor Gray
