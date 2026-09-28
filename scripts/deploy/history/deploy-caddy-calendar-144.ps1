# ============================================================
# #144 Caddy OS シフトカレンダー
#   ・出勤希望が来ていないキャディも候補に出す（×も選べる）
#   ・この日の出勤希望をカレンダー内で代理入力できる（押すたび 空欄→○→△→×）
#   ・「確定に???ります」の文字化けを修正
#
# 使い方: 右クリック →「PowerShellで実行」
#   または cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\deploy-caddy-calendar-144.ps1
#
# migration なし（コード反映のみ）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/3] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/3] コミット（今回の変更ファイルのみ）..." -ForegroundColor Cyan
git add -- "apps/caddy-os/src/app/calendar/board.tsx" "docs/genesis/DECISIONS.md" "NEXT_TASKS.md"
git status --short
git commit -m "caddy-os: 出勤希望が無いキャディも割り当て可能なことを明示＋希望をカレンダーで代理入力 (#144)" -m @"
小川さん依頼「CADの出勤希望が来てなくてもこちらから入力できるようにしてほしい」

- 候補ドロップダウンを3グループに分割: 出勤希望あり（○/△）／希望なし・未回答（そのまま割り当てできます）／
  ×（不可と回答）。従来は × のキャディが候補から消えており「希望を出した人しか選べない」画面だった
- 日パネルの「この日の出勤希望」を押せるボタンに変更。押すたび 空欄→○→△→× と一巡して即保存
  （setAvailability＝/availability の表と同じ server action・source は admin）
- 「確定に???ります」の文字化けを修正
- サーバー側の割当ロジックは変更なし（元から希望の有無を問わず登録できた）

検証: caddy-os の tsc クリーン。migrationなし。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MBuDuUE2LNoKMb18weRNs9
"@

Write-Host "[3/3] push（Vercel が caddy-os を自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。2-3分後に caddy-os のデプロイが終わります。" -ForegroundColor Green
Write-Host "確認: https://caddy-os-omega.vercel.app/calendar → 日付をタップ → キャディ一覧に未回答の人も並ぶこと" -ForegroundColor Gray
