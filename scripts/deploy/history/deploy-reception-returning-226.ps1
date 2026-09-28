# ============================================================
# #226 受付タブレットに「2回目以降の方」を追加（お名前で探して選ぶだけ）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-reception-returning-226.ps1
#
# ※ migration 0150 は適用済み（2026-09-06・MCP）。ここはコードだけ
# ※ パスに [token] が入るので git --literal-pathspecs を使う
#    （[] を「文字クラス」と解釈されると、そのファイルだけ黙って取り残される。#208の再発防止）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git --literal-pathspecs add -- `
  "supabase/migrations/0150_reception_returning_guest.sql" `
  "apps/member-os/src/lib/reception-search-pure.ts" `
  "apps/member-os/src/app/reception/[token]/actions.ts" `
  "apps/member-os/src/app/reception/[token]/page.tsx" `
  "apps/member-os/src/app/reception/[token]/reception-form.tsx" `
  "apps/member-os/src/app/reception/[token]/reception-ui.tsx" `
  "apps/member-os/src/app/reception/[token]/returning-form.tsx" `
  "apps/member-os/src/app/reception/[token]/reception-entry.tsx" `
  "tests/reception-search.test.ts" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "NEXT_TASKS.md" `
  "deploy-reception-returning-226.ps1"

# 取り残しチェック（#208: 新規ファイルが1つ残ったまま push され本番ビルドが落ちた）
$left = git --literal-pathspecs status --porcelain -- "apps/member-os/src/app/reception" "apps/member-os/src/lib/reception-search-pure.ts" |
        Where-Object { $_ -match '^\?\?' }
if ($left) {
  Write-Host "⚠ 受付まわりに未追加のファイルが残っています:" -ForegroundColor Red
  $left | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
  throw "未追加のファイルがあるため中止しました"
}

git status --short

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "コミット済みのため commit は飛ばします。" -ForegroundColor Yellow
} else {
git commit -m "受付: 2回目以降の方はお名前を選ぶだけにした（毎回の記入をやめる） (#226)" -m @"
ユーザー指示:
  ゴルフウィングの受付時にお客様にipadで記入してもらうときに、再来の人に
  何回も書いてもらうの申し訳ないので、再来の方はこちらみたいなところで
  名前を検索したら出るようにしてください。

1. これまで来店のたびに全部だった
   /reception/[token] は氏名・カナ・生年月日・住所・電話・メール・職業を毎回お願いしていた。
   書き直すたびに表記がぶれて mbr_guests に同じ人が何人も増える(#190と同じ根っこ)。
   GOLF WING の受付台帳は既に6,250人。

2. 最初の1枚で道を分ける
   「2回目以降の方」/「初めてのご来店の方」。再来はお名前(漢字・カナ・ひらがな・姓だけ可)で
   引いて、候補を選べば確定。本人確認(電話下4桁など)は挟まない = ユーザー選択。
   誤って別人を選んでも増えるのは来店1行だけで、スタッフが台帳で直せる。

3. 前回の個人情報は画面に出さない(ここが肝)
   お客様のタブレットは誰でも触れる。名前を打っただけで他人の住所が読める画面を作らない。
   search_reception_guests(0150) が返すのは 氏名・カナ・電話の下4桁・前回来店日・来店回数だけ。
   前回の住所・電話はサーバー側で guest_id からたどるので画面に出す必要が無い。
   mbr_guests は作らないし上書きもしない(前回のご登録が正)。

4. アンケートは今日の利用区分のぶんを毎回いただく(ユーザー指示)
   フィッティングならフィッティングの設問、体験なら体験の設問。
   出し分けは reception-ui.tsx の SurveyFields 1か所(画面ごとに書くと必ず片方だけズレる)。
   「当店を何で知りましたか」だけは初回で伺い済みなので再来には出さない。

5. 再来カウントが手入力なしで正しくなる
   前回のご来店日を repeat_date(台帳P列「再来の場合日付」)に自動で入れる。
   ダッシュボードの再来判定は元々この列を見ていたが、手で入れない限り埋まらなかった。

6. 検索の正規化はDB側1か所
   app.kana(0150) = ひらがな→カタカナ・空白/中黒/ドット除去。app.digits(0110)の氏名版。
   「山田 太郎」「山田太郎」「やまだ」「ヤマダ」が同じお名前になる。
   1文字では引かない。候補は最大8件・最終来店が新しい順。実測 約90ms/6,250人。

migration 0150 適用済み
member-os の tsc --noEmit 通過・next build 成功(クラウドでcloneして実走)
tests 641件パス(新規9件)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E7MHAoWuwakSBSryENh4fV
"@
}

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel の member-os が READY になったら次の順で確認してください。" -ForegroundColor Green
Write-Host " 1. 店頭タブレットの受付URLを開く → 最初に【2回目以降の方】【初めてのご来店の方】が出る" -ForegroundColor Cyan
Write-Host " 2. 【2回目以降の方】→ 常連の方の姓を入れて【検索】→ お名前・フリガナ・前回来店日・電話下4桁が出る" -ForegroundColor Cyan
Write-Host "    （ご住所・生年月日は出ません。意図どおりです）" -ForegroundColor DarkGray
Write-Host " 3. 選ぶ → 本日のご利用 → アンケート → 同意 → 受付" -ForegroundColor Cyan
Write-Host " 4. 受付台帳にその方の行ができ、新しいお客様が増えていない／P列に前回の来店日が入っている" -ForegroundColor Cyan
Write-Host " 5. 予約からの受付URL /reception/v/... はこの選択画面を通らず、これまでどおり入力済みで開く" -ForegroundColor Cyan
Write-Host ""
Write-Host "次の判断: 同姓同名が多いお名前だと他の方のお名前が最大8件並びます。" -ForegroundColor Yellow
Write-Host "気になれば「候補を選んだあとに電話の下4桁を確認する」を足せます（1画面追加で済む作りです）。" -ForegroundColor Yellow
