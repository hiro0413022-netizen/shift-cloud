# ============================================================
# #195 FRANK 法人プラン（法人ライト／法人プレミアム）＋予約は「消化してから次を取る」
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-corporate-195.ps1
#
# ※ migration 0140 は適用済みです（DBは先に直してあります）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

foreach ($f in @(".git\HEAD.lock", ".git\index.lock", ".git\COMMIT_EDITMSG.lock")) {
  if (Test-Path $f) { Remove-Item $f -Force; Write-Host "removed $f" -ForegroundColor Yellow }
}
Get-ChildItem -Path ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

git add -- `
  "packages/core/src/frank-corporate.ts" `
  "packages/core/src/frank-corporate-members.ts" `
  "packages/core/package.json" `
  "tests/frank-corporate.test.ts" `
  "apps/genesis/src/lib/frank-booking.ts" `
  "apps/genesis/src/lib/frank-join.ts" `
  "apps/member-os/src/app/join-web/page.tsx" `
  "apps/member-os/src/app/join-web/web-join-form.tsx" `
  "apps/member-os/src/app/join-web/actions.ts" `
  "apps/member-os/src/app/(main)/frunk/actions.ts" `
  "apps/member-os/src/app/(main)/frunk/[id]/page.tsx" `
  "supabase/migrations/0140_frank_corporate_plans.sql" `
  "sites/frank-golf/_build.py" `
  "sites/frank-golf/assets/site-data.js" `
  "sites/frank-golf/corporate.html" `
  "sites/frank-golf/plan.html" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "deploy-frank-corporate-195.ps1"

git status --short

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "コミット済みのため commit は飛ばします。" -ForegroundColor Yellow
} else {
git commit -m "FRANK: 法人プランを入会できるようにし、予約を「消化してから次を取る」に統一した (#195)" -m @"
ユーザー依頼:
  法人ライトとプレミア会員の登録ができるようにしてください。
  入会は通常通りHPからしていきたいです。
  法人会員の説明や魅力を伝えるページもHPに追加してください。
  予約を消化してからの次回予約は基本的に全会員統一です。

1. 非公開のはずのプランがお客様の入会フォームに並んでいた
   /join-web は active なプランを全部出していたため、
   note に「一般公開しない」と書いてある テスト会員(110円)・スタッフ(0円)・
   モニター会員(0円) がそのまま選べる状態だった。
   active（画面に出す）と public_signup（お客様が申し込める）を別の列にして塞ぐ。
   画面から消すだけでは守れないので、直接POSTされても通さない。

2. 法人は「会社が契約して、社員が使う」形
                 月額(税抜)  利用者   先に持てる予約   同伴ビジター
   法人ライト     39,800円    2名     御社合計4コマ    なし
   法人プレミアム 59,800円    4名     御社合計8コマ    無料・回数制限なし

   利用者ごとに会員番号を発行する。会社で番号を1つ使い回すと
   「誰が来たか」が残らず、レッスンカルテも分けられない。
   お一人ずつ出せば、予約・会員証QR・カルテが普段の会員と同じ仕組みで動く。

3. お金は増やさない
   月会費のサブスクを持つのは契約者の行だけ。
   利用者の行には決済情報を入れない。ここを間違えると人数分の請求が立つ。

4. 予約は消化してから次を取る（全会員共通）
   まだ消化していない予約として持てるコマ数に上限（1コマ=1時間）。
   ライト1・レギュラー1・マスター2・法人ライト4・法人プレミアム8。
   法人は登録者全員の合計で数える。
   判定は @yozan/core/frank-corporate に置き、画面もサーバーも同じ関数を通す。

5. 行の作り方は core に1か所だけ
   入口が2つある（Web入会の入金確定=genesis / 店頭の承認=member-os）ので
   frank-corporate-members.ts に寄せた。採番はアプリごとなのでコールバックで受ける。
   何度呼ばれても増えない（親＋電話番号で既存を探す）。

6. 人は入れ替わる
   会員カードの利用者パネルで追加・登録を外せる（上限まで）。
   外した方は行を消さず退会にして履歴を残す。
   利用者ごとに違う電話番号が要る（ログインが会員番号＋下4桁のため）。

7. 公式サイトの法人ページを作り直した
   従来は金額2行と「公式LINEでご相談ください」だけで入会導線が無かった。
   2プランの比較・スペック表・ご入会の流れ・法人FAQ6問・入会ボタンを追加。
   ついでに site-data.js の会員向けURLが member-os-tau のままだったのを
   my.frankgolf.jp に直した（#188の漏れ）。

8. 請求書払いは無い（カードのみ）
   法人は請求書を希望されることが多いのでFAQに明記し、
   請求先の住所・メールをご担当者と別に指定できるようにした。

migration 0140 適用済み
member-os / genesis の tsc --noEmit と next build 通過（クラウドでcloneして実走）
tests 561件パス（新規13件）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0171JzpCc7kcd7TBBCs68mDu
"@
}

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel が READY になったら次の順で確認してください。" -ForegroundColor Green
Write-Host " 1. https://my.frankgolf.jp/join-web を開く" -ForegroundColor Cyan
Write-Host "    → プランが 個人3つ＋法人2つ の5つだけになっている（テスト会員・スタッフ・モニターが消えている）" -ForegroundColor Cyan
Write-Host " 2. 法人プランを選ぶ → 会社名・請求先・ご利用者の欄が出る" -ForegroundColor Cyan
Write-Host " 3. https://frankgolf.jp/corporate.html → 2プランの比較・FAQ・入会ボタン" -ForegroundColor Cyan
Write-Host " 4. 会員管理の会員カード → 法人契約なら利用者パネルで追加・登録を外せる" -ForegroundColor Cyan
Write-Host ""
Write-Host "⚠ 予約の数え方が全会員で変わります（消化してから次を取る）。" -ForegroundColor Yellow
Write-Host "   レギュラー会員は先の予約を1コマしか持てません。運用に合わなければ" -ForegroundColor Yellow
Write-Host "   frunk_plans.max_open_slots の数字だけで変えられます（デプロイ不要）。" -ForegroundColor Yellow
