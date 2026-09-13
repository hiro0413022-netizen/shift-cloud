# ============================================================
# #186 予約を聞けるようにし、話しかけて入れられるようにする
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-jarvis-act-186.ps1
#
# ※ migration 0135 は適用済み（ビュー4本＋実行ポリシー）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "supabase/migrations/0135_ask_data_bookings.sql" `
  "packages/core/src/ask-data.ts" `
  "apps/genesis/src/lib/ai-execution.ts" `
  "apps/genesis/src/lib/jarvis.ts" `
  "apps/genesis/src/lib/jarvis-pure.ts" `
  "apps/genesis/src/components/jarvis.tsx" `
  "tests/jarvis.test.ts" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "deploy-lesson-club-verify-185.ps1"

git status --short

git commit -m "genesis: 予約を聞けるようにし、話しかけて入れられるようにした (#186)" -m @"
「予約状況を聞いても返答してくれますか」→ 答えは「今は無理」だった。
0053のgnv_*に予約のビューが1つも無く、LLMからは存在しないものに見えていた。
（予約はfrunk_bookingsに実在。9/2以降に有効23件）

読み取り: gnv_bookings / gnv_walkins / gnv_orders を追加し、カタログに登録。

途中で見つけた不具合:
  gnv_trials が空テーブル mbr_trial_bookings を読んでいた。
  体験の正は mbr_walkin_visits(visit_type='trial')。
  つまり「体験は何件？」と聞くと黙って0件と答えていた。
  元データを向け直して 0件 → 1,121件。
  数字はPostgresが計算する設計でも、読む場所が違えば正しく0を返す。

書き込み: ユーザー判断「取消枠（入るが5分は戻せる）」。
  #61 の auto_undo とホームの「実行予定」UIに乗せ、新しい仕組みは作っていない。
  booking_create / booking_cancel / walkin_add を auto_undo(5分) で登録。
  staff_directive はユーザー判断で approval → auto_undo(5分)。

守った線:
  - お客様への送信・課金・デプロイ・契約は act に入れない（VISION §7・承認のまま）
  - 実行してよい操作は4つに固定（AIが思いついた操作名で書き込ませない）
  - 直接DBに書かず必ず ai_action_queue を通す
    ＝実行の瞬間に空きを見直せる／取消UIが既にある／監査が1か所
  - 営業時間・定休日はBookingCfg、打席はA→B→C・レフティB固定・D打席は除外
  - キャンセルは消さず status='cancelled'
  - 日付・時刻・お名前が曖昧なら作らず1つだけ聞き返す

GOLF WING宝塚の予約はSmart Hello（外部）なので読めても書けない。

migration 0135 / tests 501件パス

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Uugp7HXc17XWUs1va9eCy3
"@

git push origin main

Write-Host ""
Write-Host "push 完了。READY になったらホームで試してください:" -ForegroundColor Green
Write-Host "  「ジェネシス、今日以降の予約は何件？」  → 数字が返ります" -ForegroundColor Cyan
Write-Host "  「ジェネシス、9月3日の14時に山田様を1時間で予約入れて」 → 実行予定に入り5分間は取り消せます" -ForegroundColor Cyan
