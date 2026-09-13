# ============================================================
# #151 member-os: 予約・体験・受付台帳を「後から直せる」ように
#
#   これまで member-os には予約を直す手段が一つも無く、
#   日時を間違えた／変更の電話が来た、というときは「消して作り直す」しかなかった。
#   体験予約だと申込と受付台帳まで道連れに消えていた。
#
#   - 予約の 日時・打席・人数・氏名・電話・備考 を変更できるように（予約一覧／予約詳細の両方）
#   - 体験は 予約・申込・受付台帳 の3点を必ず揃える（pref1も直す）
#   - 受付台帳の 来店日・利用区分 も編集可に
#   - /trials に「実際に確定している予約日時」を表示（今まで希望日しか出ていなかった）
#   - 変更メールは「お客様にメールで知らせる」にチェックしたときだけ送る
#   - 移動先がレッスン枠と重なる場合も弾く（作成時は見ていなかった穴）
#
# 使い方: 右クリック →「PowerShellで実行」
# migration なし
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/3] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "[2/3] コミット..." -ForegroundColor Cyan
git add -- "apps/member-os/src" "packages/core/src/frank-walkin.ts" "docs/genesis/DECISIONS.md"
git status --short
git commit -m "member-os: 予約・体験・受付台帳を後から直せるようにした（日時/打席/氏名/電話/来店日） (#151)" -m @"
小川さん依頼「member-osで登録されている体験予約などの日時変更を行えるように。
変更の可能性があるものはすべて変更できるように」

発見:
  member-os には予約を直す手段が一つも無かった（作る・状態変更・入金・削除だけ）。
  booked_date / start_time / end_time / bay_id を書くコードはリポジトリ全体で新規作成の2か所だけ。
  日時を間違えたら「消して作り直す」しかなく、体験予約だと申込と受付台帳まで道連れに消えていた。

対応:
  - updateBooking を新設。日時・打席・人数・氏名・電話・備考を1本で変更
    重なりチェックは自分自身を除外（除かないと必ず自分と衝突する）
    レッスン枠(frunk_lesson_slots)とも重なりを見る＝作成時に無かったダブルブッキングの穴も塞いだ
    営業時間・定休日を再判定。会員予約の氏名/電話は会員マスタが正なので都度予約のときだけ上書き
  - 体験は 予約 / 申込 / 受付台帳 の3点を揃える。申込の pref1 も書き換える
    （/trials の一覧は今も pref1 を表示しているので、直さないと一覧が嘘をつく）
  - syncTrialWalkin: 台帳のメモに埋まった旧時刻が残る穴を修正。
    自動生成のまま（「体験予約」で始まる）ときだけ作り直し、スタッフの書き換えは尊重する
  - 受付台帳の visited_on / visit_type を編集可に（従来は来店日そのものが直せなかった）
  - /trials に確定済みの予約日時を表示＋予約管理へのリンク
  - 変更メール buildBookingRescheduleMail はチェックしたときだけ送る
    （電話で口頭合意した直後に自動で飛ぶと二度手間になるため）

検証: member-os / genesis とも tsc クリーン、テスト375件通過。migrationなし。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MBuDuUE2LNoKMb18weRNs9
"@

Write-Host "[3/3] push..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。2-3分でデプロイされます。" -ForegroundColor Green
Write-Host "確認1: 予約管理 → 予約一覧の各行に「日時・打席を変更」が出ること" -ForegroundColor Gray
Write-Host "確認2: 体験の予約を別日に動かすと、体験申込と受付台帳の日付も一緒に変わること" -ForegroundColor Gray
Write-Host "確認3: 受付台帳の行で来店日・利用区分が直せること" -ForegroundColor Gray
