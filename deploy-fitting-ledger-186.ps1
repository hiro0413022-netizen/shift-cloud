# ============================================================
# #186 フィッティング予約 → 受付台帳（同じことを二度書かせない）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-fitting-ledger-186.ps1
#
# ※ migration 0135 は適用済み（2026-08-29・MCP）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "supabase/migrations/0135_fitting_walkin_link.sql" `
  "packages/core/src/fitting-walkin.ts" `
  "packages/core/package.json" `
  "apps/reserve-os/src/app/(main)/requests/[id]/actions.ts" `
  "apps/reserve-os/public/manual.md" `
  "apps/shift-cloud/src/lib/store-dash.ts" `
  "apps/shift-cloud/src/app/store/actions.ts" `
  "apps/shift-cloud/src/app/store/dashboard.tsx" `
  "apps/shift-cloud/src/app/store/store-client.tsx" `
  "apps/shift-cloud/public/manual.md" `
  "apps/member-os/src/app/reception/v/[itoken]/page.tsx" `
  "apps/member-os/src/app/reception/[token]/actions.ts" `
  "apps/member-os/src/app/reception/[token]/reception-form.tsx" `
  "apps/member-os/public/manual.md" `
  "tests/fitting-walkin.test.ts" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "NEXT_TASKS.md" `
  "deploy-lesson-club-verify-185.ps1"

git status --short

git commit -m "フィッティング予約を受付台帳につなぐ。お客様に二度書かせない (#186)" -m @"
きっかけは本番データ。

R-0004 中清様: 8/25にWeb申込、第1希望は8/29 13:30。
  申込は4日間 pending のまま。
  当日14:03、店頭タブレットで氏名・カナ・電話・住所・生年月日をゼロから手入力。
  予約フォームには全部書いてあった。

なぜ気づけなかったか:
  申込が店舗ダッシュボードに出るのは sp_tasks 経由の「申込を受けた日のマス」だけ。
  しかも確定すると done で消えるので、当日には何も出ない。
  折り返し待ちを日付の奥に置いていた。

直したこと:

1. 確定を押した瞬間に受付台帳へ（packages/core/src/fitting-walkin.ts）
   冪等キー RES-<request_id>（FRANKの体験 FRANK-TRIAL- と衝突しない）。
   見送り・キャンセルで自動で下げる。ただし来店打刻済みの行は残す
   （実際に来た人を件数から消さない）。
   再同期で直すのは日付・お客様の紐付け・自動生成のままのメモだけ。
   スタッフが書いた料金・成約・アンケートには触らない。

2. 店舗ダッシュボードの一番上に常設パネル
   折り返し待ちの申込（◯日経過バッジ・電話・申込詳細）
   本日のフィッティング（来店ボタン）

3. 来店ボタン → 台帳に打刻 ＋ その1件だけを開ける受付URLを発行
   1回きり・6時間で失効。生トークンは発行時のみ、DBはsha256。

4. /reception/v/[URL] = 入力済みで開く受付フォーム
   氏名・カナ・電話・メールは埋まっている。
   予約でいただいた内容（クラブ・HS・お悩み）は確認カードで読めるだけ。
   お客様は足りない欄と署名だけ。新しい行もお客様も作らない。

5. 名寄せをDB関数 find_guest_by_contact に移した
   従来は mbr_guests を500件だけ読んで突き合わせていた。
   GOLF WINGは既に6,213人。既存客が新規として二重に増える状態だった。
   中清様が既存客としてヒットすることを実データで確認済み。

注意: 確定＝台帳なので無断キャンセル分も件数に乗る。
      実来店は arrived_at で判別できるようにしてある。

tsc（shift-cloud / member-os / reserve-os）通過
tests 498件パス（新規7件）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KfDWGHowGUR4kbFLZ87Ur1
"@

git push origin main

Write-Host ""
Write-Host "push 完了。READY になったら次の順で確認してください。" -ForegroundColor Green
Write-Host " 1. Reserve OS で申込を1件【確定】する" -ForegroundColor Cyan
Write-Host " 2. 店舗ダッシュボードの一番上に『本日のフィッティング』が出る" -ForegroundColor Cyan
Write-Host " 3. 【来店】→ お名前・電話が入った受付フォームが開く" -ForegroundColor Cyan
Write-Host ""
Write-Host "先に片付けてほしい申込が2件あります:" -ForegroundColor Yellow
Write-Host " R-0004 中清様 … 8/29にご来店済み。Reserve OS では pending のままです" -ForegroundColor Yellow
Write-Host " R-0005 谷川様 … メールが @golfwing.jp。テストならキャンセルにしてください" -ForegroundColor Yellow
