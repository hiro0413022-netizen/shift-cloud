# ============================================================
# #145c 提出PDFは同じ日を1行にまとめる ＋ migration 0121 の収録
#
#   - PDFを日付単位に集約。列を 日付 / 人数 / キャディ名（、区切り）/ 備考 に変更
#     1件1行だと同じ日付が何行も並び、ゴルフ場側が「その日に何人来るか」を数えにくかった
#   - 名前が多い日は行が高くなるので、ページ分割を件数ではなく積み上げ高さで判定
#   - CSVは1件1行のまま（Excelで並べ替え・集計する用途のため）
#
#   ＋ supabase/migrations/0121（DBには適用済み・ファイルを収録するだけ）
#     staff.sort_order / staff_schedule_types / cad_partners.staff_id / 業務区分「キャディ」
#     ※ コード側の対応（シフト作成の業務選択・紙シフトの並び順）は次回
#
# 使い方: 右クリック →「PowerShellで実行」
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/3] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/3] コミット..." -ForegroundColor Cyan
git add -- "apps/caddy-os/src/lib/export-pdf.ts" "docs/genesis/DECISIONS.md" `
    "supabase/migrations/0121_shift_work_types_and_staff_order.sql"
git status --short
git commit -m "caddy-os: 提出PDFは同じ日を1行にまとめる (#145c) ＋ シフト業務区分と並び順のmigration (0121)" -m @"
小川さん指示「同じゴルフ場、同日に2名以上の派遣がある場合、表示は1行にまとめ」

- PDFを日付単位に集約。列を 日付 / 人数 / キャディ名（、区切り）/ 備考 に変更。
  1件1行だと同じ日付が何行も並んで、ゴルフ場側が「その日に何人来るか」を数えにくかった
- 名前が多い日は行の高さが伸びるため、ページ分割を件数ではなく積み上げ高さで判定。
  日本語は単語境界が無いので折り返しは1文字ずつ幅を測る
- 備考は同じ文言を重複させずに / でつなぐ
- CSVは1件1行のまま（Excelで並べ替え・集計する用途のため）

あわせて migration 0121（DBには適用済み）を収録:
  - staff.sort_order（紙シフトの並び順）
  - staff_schedule_types（シフトの「業務」を人ごとに出し分ける対応表）
  - cad_partners.staff_id（キャディとスタッフの紐付け。4名バックフィル済）
  - schedule_types に「キャディ」を追加
  ※ コード側は次回。列とテーブルが増えるだけなので現行動作に影響なし

検証: caddy-os の tsc クリーン。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MBuDuUE2LNoKMb18weRNs9
"@

Write-Host "[3/3] push..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。2-3分でデプロイされます。" -ForegroundColor Green
Write-Host "確認: /exports の PDF で 8/7 や 8/9 が1行にまとまり「2名」と出ること" -ForegroundColor Gray
