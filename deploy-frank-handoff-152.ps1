# ============================================================
# #151 member-os: 予約・体験・受付台帳を「後から直せる」ように
# #152 会員ポータルからの予約で会員番号を聞き直さない（引き渡しトークン）
#
#   #151（前回お渡ししたぶん・まだ未プッシュでした）
#     - 予約の 日時・打席・人数・氏名・電話・備考 を後から変更できるように
#     - 体験は 予約・申込・受付台帳 の3点を必ず揃える
#     - 受付台帳の 来店日・利用区分 も編集可に
#
#   #152（今回）
#     - マイページで「＋ Web予約する」を押したあと、frankgolf.jp で
#       会員番号＋電話下4桁を聞き直されていたのをやめた
#     - レッスン予約ページも同じ。月会費のカード登録も聞き直さない
#     - 会員番号の入力例 F0001 → FR0001（実際の発行は FR 始まり）
#
# 使い方: 右クリック →「PowerShellで実行」
# migration なし
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/5] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock", ".git\index.lock", ".git\objects\maintenance.lock", `
    ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock" -Force -ErrorAction SilentlyContinue
Get-ChildItem ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue

# コミットメッセージは UTF-8(BOMなし) のファイルに書き出してから -F で渡す（文字化け対策）
$utf8 = New-Object System.Text.UTF8Encoding($false)
$msg1 = "$env:TEMP\yozan_msg_151.txt"
$msg2 = "$env:TEMP\yozan_msg_152.txt"

$t1 = @"
member-os: 予約・体験・受付台帳を後から直せるようにした（日時/打席/氏名/電話/来店日） (#151)

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
  - syncTrialWalkin: 台帳のメモに埋まった旧時刻が残る穴を修正。
    自動生成のまま（「体験予約」で始まる）ときだけ作り直し、スタッフの書き換えは尊重する
  - 受付台帳の visited_on / visit_type を編集可に
  - /trials に確定済みの予約日時を表示＋予約管理へのリンク
  - 変更メールはチェックしたときだけ送る

※ DECISIONS.md の #151 の記述は次のコミット（#152）に含めています。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MBuDuUE2LNoKMb18weRNs9

"@
[System.IO.File]::WriteAllText($msg1, $t1, $utf8)

$t2 = @"
会員ポータルからの予約で会員番号を聞き直さないようにした（引き渡しトークン） (#152)

ユーザー指摘「会員ログインページからログインして予約したら、ウェブサイトで
また会員番号とパスワードを入力する必要があるのはおかしいですよね」

原因:
  #93 でお客様の予約入口を公式サイト1か所に集約したが、member-os（別Vercel・別ドメイン・
  cookie は mos_member）と frankgolf.jp の静的ページの間に、ログイン状態を渡す手段が
  無かった。ドメインが違うので cookie は共有できず、booking.html は毎回
  会員番号＋電話下4桁を最初から要求していた。

対応:
  - packages/core/src/frank-handoff.ts を新設。HMAC-SHA256 の署名だけで検証できる
    ステートレスなトークン。鍵は SUPABASE_SERVICE_ROLE_KEY から派生
    （FRANK_HANDOFF_SECRET があればそちら＝鍵の入れ替え可）。DBに引き換え表を作らない
  - 中身は会員番号と期限だけ。電話番号などの個人情報は載せない。既定6時間
  - booking.html / lesson-booking.html は ?t= を読んだ直後に history.replaceState で
    URLから消し、sessionStorage にだけ持つ（共有・履歴・Referer に残さない）
  - 期限切れ・鍵未設定は従来の入力フォームに戻るだけ。予約ページは止まらない
  - genesis 側は authMember({memberNo, phoneLast4, token}) に認証入口を一本化。
    打席予約・レッスン予約・月会費のカード登録の3経路がすべてここを通る。
    トークンで出来るのは「その会員として予約する」だけで管理操作には使えない
  - GET ?me=1&t= を追加。ページが「◯◯様としてご予約いただけます」と出せる
    （会員情報の入力欄はまるごと隠れ、手順の番号も繰り上がる）

あわせて:
  会員番号の入力例が F0001 だったが実際の発行は FR0002 のような FR 始まり。
  打席予約・レッスン予約・会員ログインの3か所を FR0001 に修正（スクショで発覚）

検証: genesis / member-os とも tsc クリーン。tests/frank-handoff.test.ts を追加し
      （改ざん・鍵違い・期限切れ・壊れた入力）テスト381件通過。migration なし。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MBuDuUE2LNoKMb18weRNs9

"@
[System.IO.File]::WriteAllText($msg2, $t2, $utf8)

Write-Host "[2/5] #151 をコミット..." -ForegroundColor Cyan
git add -- "apps/member-os/src/app/(main)/actions.ts" `
    "apps/member-os/src/app/(main)/dashboard/frank-calendar.tsx" `
    "apps/member-os/src/app/(main)/reservations/actions.ts" `
    "apps/member-os/src/app/(main)/reservations/page.tsx" `
    "apps/member-os/src/app/(main)/trials/page.tsx" `
    "apps/member-os/src/app/(main)/visit-row.tsx" `
    "apps/member-os/src/components/booking-detail.tsx" `
    "apps/member-os/src/lib/frank-mail.ts" `
    "packages/core/src/frank-walkin.ts"
git commit -F $msg1

Write-Host "[3/5] #152 をコミット..." -ForegroundColor Cyan
git add -- "apps/genesis/src/app/api/public/frank/billing/route.ts" `
    "apps/genesis/src/app/api/public/frank/booking/route.ts" `
    "apps/genesis/src/app/api/public/frank/lesson/route.ts" `
    "apps/genesis/src/lib/frank-booking.ts" `
    "apps/genesis/src/lib/frank-lesson.ts" `
    "apps/genesis/src/lib/frank-square-billing.ts" `
    "apps/member-os/src/app/member/book/page.tsx" `
    "apps/member-os/src/app/member/login/page.tsx" `
    "apps/member-os/src/app/member/page.tsx" `
    "apps/member-os/src/lib/frank-site-link.ts" `
    "packages/core/package.json" `
    "packages/core/src/frank-handoff.ts" `
    "sites/frank-golf/booking.html" `
    "sites/frank-golf/lesson-booking.html" `
    "tests/frank-handoff.test.ts" `
    "docs/genesis/DECISIONS.md"
git commit -F $msg2

Write-Host "[4/5] 内容の確認..." -ForegroundColor Cyan
git log --oneline -3
git status --short

Write-Host "[5/5] push..." -ForegroundColor Cyan
git push origin main

Remove-Item $msg1, $msg2 -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "完了。2-3分でデプロイされます。" -ForegroundColor Green
Write-Host "確認1: 会員ページにログイン →「＋ Web予約する」→ 会員番号を聞かれず" -ForegroundColor Gray
Write-Host "       『古川 博庸 様としてご予約いただけます』と出ること" -ForegroundColor Gray
Write-Host "確認2: そのままアドレスバーを見て ?t=... が消えていること" -ForegroundColor Gray
Write-Host "確認3: 予約管理 → 予約一覧の各行に「日時・打席を変更」が出ること（#151）" -ForegroundColor Gray
