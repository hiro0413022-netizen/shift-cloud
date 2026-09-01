# ============================================================
# #187 FRANK 打席予約を毎時00分スタートに ＋ 25分パーソナルレッスンのオプション
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-hourly-187.ps1
#
# ※ migration 0136 は適用済み（2026-09-01・MCP）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "supabase/migrations/0136_frank_bay_lesson_option.sql" `
  "packages/core/src/frank-booking.ts" `
  "apps/genesis/src/lib/frank-booking.ts" `
  "apps/genesis/src/app/api/public/frank/booking/route.ts" `
  "apps/genesis/src/app/(main)/site-admin/actions.ts" `
  "apps/genesis/src/app/(main)/site-admin/page.tsx" `
  "apps/member-os/src/lib/frank-reservation.ts" `
  "apps/member-os/src/app/(main)/reservations/actions.ts" `
  "apps/member-os/src/app/(main)/reservations/page.tsx" `
  "sites/frank-golf/booking.html" `
  "tests/frank-member-slot-step.test.ts" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "NEXT_TASKS.md" `
  "deploy-frank-hourly-187.ps1"

git status --short

git commit -m "FRANK: 打席予約を毎時00分スタートにし、25分パーソナルを付けられるようにした (#187)" -m @"
ユーザー依頼:
  30分毎に予約できるようにしているが、00分スタートのみにしたい。
  会員も00分で打席を予約してから、オプションで25分のパーソナルを申し込めるように。

決めたこと（ユーザー確定）:
  適用範囲   打席予約（会員）＋体験予約。スタッフ画面は30分刻みのまま
  利用時間   60分・120分のみ（30分・90分はお客様側から外す）
  レッスン   打席予約と同時に「希望」を出す。担当プロは店舗が確定する
  時間帯     打席のお時間の中で店舗が調整（お客様には選ばせない）

1. お客様側とスタッフ側の刻みを分けた
   slot_minutes(30) は台帳・スタッフ画面のまま。
   お客様は member_start_step(60) / member_minutes_options([60,120])。
   1つの設定を60にすると、店頭で「14:30から30分」が入れられなくなる。

2. 空き判定を「利用時間ぶん続けて空いているか」に直した
   従来は開始マスだけを見て○を出していた。30分刻みならほぼ一致していたが、
   60分刻み＋2時間が入ると「○を押したのに予約できません」が普通に起きる。

3. 埋まりの数え方をマスの頭に丸める方式にした（coveredCells）
   従来の数え方だと 14:30〜15:30 の予約が60分刻みの列を1つも塗らず、
   14:00 が「空き」に見えていた。塗り残しはそのまま二重予約になる。

4. パーソナルレッスンは frunk_bookings の列で持つ（0136）
   予約1件に0か1件なので別テーブルを作らない。
   requested の索引を貼り、予約管理の上部に未確定件数の常設パネルを出す。
   お断りは declined で残す（消すと「頼んだのに何も言われなかった」になる）。

5. 体験予約は変更なし
   TRIAL_START_STEP=60 で既に毎時00分のみ（2026-07-31）。今回で刻みがそろった。

既存の有効予約27件（9/2〜10/31）は全部00分開始。見え方が変わる予約は無い。

tsc（genesis / member-os）通過・next build 通過
tests 514件パス（新規7件）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017YG5wrkfqLZDzcy9YUJEeQ
"@

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel が READY になったら次の順で確認してください。" -ForegroundColor Green
Write-Host " 1. frankgolf.jp/booking.html で日付を選ぶ → 列が 10:00,11:00,... と1時間ごとになっている" -ForegroundColor Cyan
Write-Host " 2. 利用時間が「1時間 / 2時間」の2つだけになっている" -ForegroundColor Cyan
Write-Host " 3. ○を押す → 下に「パーソナルレッスン（25分）を追加する ＋2,500円」が出る" -ForegroundColor Cyan
Write-Host " 4. チェックして予約 → member-os の予約管理 上部に『ご希望 1件 未確定』が出る" -ForegroundColor Cyan
Write-Host " 5. 担当プロと開始時刻を入れて【確定】→ バッジが緑になる" -ForegroundColor Cyan
Write-Host ""
Write-Host "刻み・利用時間・レッスン料金は Genesis の /site-admin から変更できます（デプロイ不要）。" -ForegroundColor Yellow
Write-Host "料金を 0 にするとレッスンの受付だけ止まります。" -ForegroundColor Yellow
