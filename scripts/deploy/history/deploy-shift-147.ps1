# ============================================================
# #147 Shift Cloud: シフト作成で「業務」（キャディ等）を選べるように
#                  ＋ 紙シフトの並び順を▲▼で変えられるように
# #145d caddy-os: 提出PDFで罫線が文字を貫通していたのを修正
#
#   - シフト作成のプルダウンに「業務」グループ（キャディ / レッスン / 会議 …）
#     出す業務は人ごと。スタッフ編集の「シフトで選べる業務」でチェック
#   - Caddy OS で確定した派遣は、その人のシフトに ⛳ゴルフ場名 で自動表示（二度入力しない）
#   - スタッフ管理の一覧に▲▼。紙シフト・シフト作成・スタッフ管理が同じ並び順になる
#   - 提出PDFの文字位置を修正（枠と文字が合っていなかった）
#
#   migration 0121 はDBに適用済み（前回コミットで収録済み）
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
git add -- "apps/shift-cloud/src" "apps/caddy-os/src/lib/export-pdf.ts" "docs/genesis/DECISIONS.md"
git status --short
git commit -m "shift-cloud: シフトで業務(キャディ等)を選べるように＋紙シフトの並び順を▲▼で (#147) / caddy-os: PDFの文字位置を修正 (#145d)" -m @"
小川さん依頼
  「シフト作成時にキャディー業務の選択ができるようにしたい、表示するかどうかは人ごとに」
  「紙シフト出力のときに名前の順番を変えれるようにしたい」
  「月間派遣一覧の文字と枠があっていない」

#147 シフトの業務区分
  - schedule_types は 0001 からある業務区分マスタ（13件）で shifts.schedule_type_id という列まで
    あったのに、アプリから一度も使われていなかった。新しい概念を足さずこの線をつないだ
  - 「キャディ」を1件追加。保存は shifts.schedule_type_id、時刻は持たせない（終日その業務）
  - 誰に出すかは staff_schedule_types。行が無い人には「業務」の選択肢自体を出さない
    （全員に13件出すと現場が使えなくなる）。スタッフ編集のチェックで決める
  - Caddy OS で確定した派遣は ⛳ゴルフ場名 で自動表示。紐付けは cad_partners.staff_id
    （氏名一致では結ばない）。Shift Cloud から Caddy OS へは書かない＝入力口は1か所のまま

#147 並び順
  - staff.sort_order を追加し、スタッフ管理の一覧に▲▼。隣同士で値を交換する
  - 全員0のままだと交換しても順番が変わらないので、初回は現在の並びで10,20,30…に振り直す
  - スタッフ管理・シフト作成・紙シフトが同じ順になる
    （従来は紙だけ position,name／画面は name で別々の順だった）

#145d PDF
  - 罫線が文字を貫通していた。セル内のベースライン計算が上端寄りすぎたのが原因

検証: shift-cloud / caddy-os とも tsc クリーン。migration 0121 は適用済み。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MBuDuUE2LNoKMb18weRNs9
"@

Write-Host "[3/3] push..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。2-3分でデプロイされます。" -ForegroundColor Green
Write-Host "確認1: スタッフ管理 → 穴田さんを編集 →「シフトで選べる業務」にキャディが入っていること" -ForegroundColor Gray
Write-Host "確認2: シフト作成でその人のプルダウンに「業務」グループが出ること" -ForegroundColor Gray
Write-Host "確認3: スタッフ管理の▲▼で並べ替え → 紙シフト出力の順番が変わること" -ForegroundColor Gray
