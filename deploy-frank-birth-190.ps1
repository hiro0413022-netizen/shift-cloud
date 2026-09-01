# ============================================================
# #190 FRANK 体験予約に生年月日（必須）＋ 体験の名寄せ修正
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-birth-190.ps1
#
# ※ migration 0137 は適用済み（2026-09-01・MCP）
# ※ コミットは作成済みです。残っていれば追加でコミットし、push します
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "supabase/migrations/0137_trial_birth_date.sql" `
  "packages/core/package.json" `
  "packages/core/src/birth-date.ts" `
  "packages/core/src/frank-walkin.ts" `
  "apps/genesis/src/lib/frank-trial.ts" `
  "apps/genesis/src/app/api/public/frank/trial/route.ts" `
  "apps/member-os/src/app/trial/actions.ts" `
  "apps/member-os/src/app/trial/trial-form.tsx" `
  "sites/frank-golf/_build.py" `
  "sites/frank-golf/trial-booking.html" `
  "tests/birth-date.test.ts" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "NEXT_TASKS.md" `
  "deploy-frank-birth-190.ps1"

git status --short

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "コミット済みのため commit は飛ばします。" -ForegroundColor Yellow
} else {
git commit -m "FRANK: 体験予約に生年月日を必須で入れ、体験の名寄せが500件しか見ていなかったのを直した (#190)" -m @"
ユーザー指示:
  体験予約時に生年月日を入れるようにしてください、ここは必須。

1. なぜ体験の時点でいただくか
   体験のあと入会する方は、店頭で会員申込書にもう一度 生年月日を書いている。
   受付台帳(mbr_guests)には欄があるのに、Web体験予約からは一度も入っていなかった。
   予約時にいただければ、来店時は確認だけで済む(/reception/v/ は既に流し込む)。

2. 判定は1か所に置く
   packages/core/src/birth-date.ts (birthDateError / normalizeBirthDate / ageOn)。
   体験の入口は2つ(公式サイトの素のJS / member-os の /trial)あるので、
   画面ごとに条件を書くと必ずズレる。画面のチェックだけでは直接POSTで空のまま入るため、
   サーバー側でも同じ関数を通す。
   弾くのは日付として成立しないものだけ(2月31日・未来・1900年より前)。
   年齢での足切りはしない(体験には未成年も来る)。
   基準日は引数で渡す(環境の日付に依存する時限爆弾テストを作らない)。

3. 公式サイトは年/月/日の3プルダウン
   input type=date は iPhone/iPad のホイールで「日」が合わせにくく、
   入力を諦める方が出る。日数は選んだ年月に合わせて出し直す。

4. NOT NULL にはしない (0137)
   既存の申込には値が無い(過去分を捏造しない)。
   スタッフが電話で受けて後から埋める入口(member-os /trials)も残る。
   必須はお客様が自分で予約する入口で担保する。

5. ついでに見つけた実害 — 体験の名寄せが500件しか見ていなかった
   frank-walkin.ts の resolveGuestId は mbr_guests を .limit(500) で読んでいた。
   FRANKとGOLF WINGは同じ会社で mbr_guests は6,000人超。
   既存のお客様が体験のたびに新規として増え、来店検索でも二重に出ていた。
   #186 でフィッティング側だけ寄せた find_guest_by_contact(0135) に体験側も寄せた。

6. 既存のお客様の生年月日は上書きしない(空のときだけ埋める)

migration 0137 適用済み
tsc(genesis / member-os)通過・next build 通過(クラウドでcloneして実走)
tests 525件パス(新規7件)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SYYxiYDnAPCBuWmmM4KoUj
"@
}

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel が READY になったら次の順で確認してください。" -ForegroundColor Green
Write-Host " 1. frankgolf.jp/trial-booking.html で日時を選ぶ → お客様情報に『生年月日（年/月/日）』が出る" -ForegroundColor Cyan
Write-Host " 2. 空のまま送ると『生年月日をご入力ください』で止まる" -ForegroundColor Cyan
Write-Host " 3. 入れて予約 → member-os の受付台帳に行ができる" -ForegroundColor Cyan
Write-Host " 4. 来店時の受付フォームに生年月日が入った状態で開く（もう一度書かせない）" -ForegroundColor Cyan
Write-Host ""
Write-Host "FRANKのスタッフ打刻は開発不要で今すぐ使えます（URLは会話をご確認ください）。" -ForegroundColor Yellow
