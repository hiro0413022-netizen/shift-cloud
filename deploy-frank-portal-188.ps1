# ============================================================
# #188 FRANK お客様の入口を my.frankgolf.jp に一本化
#      ＋ 入会承認の前に決済を確かめられるようにした
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-portal-188.ps1
#
# ※ migration はありません
# ※ コミットは作成済みです。このスクリプトは残っていれば追加でコミットし、push します
#    （何もコミットするものが無くても、そのまま push まで進みます）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "packages/core/package.json" `
  "packages/core/src/frank-links.ts" `
  "apps/genesis/src/lib/frank-join-payment.ts" `
  "apps/genesis/src/lib/frank-join.ts" `
  "apps/genesis/src/lib/frank-mail.ts" `
  "apps/genesis/src/lib/frank-mail-pure.ts" `
  "apps/genesis/src/lib/frank-square-billing.ts" `
  "apps/genesis/src/app/api/public/frank/admin/join-payment/route.ts" `
  "apps/genesis/src/app/api/public/frank/join-checkout/route.ts" `
  "apps/member-os/src/middleware.ts" `
  "apps/member-os/src/lib/frank-mail.ts" `
  "apps/member-os/src/lib/frunk-join-view.ts" `
  "apps/member-os/src/app/cancel/[token]/page.tsx" `
  "apps/member-os/src/app/join-web/actions.ts" `
  "apps/member-os/src/app/member/page.tsx" `
  "apps/member-os/src/app/member/book/page.tsx" `
  "apps/member-os/src/app/member/book/book-client.tsx" `
  "apps/member-os/src/app/member/settings/page.tsx" `
  "apps/member-os/src/app/member/settings/actions.ts" `
  "apps/member-os/src/app/(main)/frunk/page.tsx" `
  "apps/member-os/src/app/(main)/frunk/actions.ts" `
  "tests/frank-pos.test.ts" `
  "tests/frunk-join-view.test.ts" `
  "scripts/frank-qr-poster.py" `
  "FRANK_GOLF_出店計画/FRANK_会員ポータルQR_A4.pdf" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "NEXT_TASKS.md" `
  "deploy-frank-portal-188.ps1"

git status --short

# すでにコミット済みなら commit は飛ばす（$ErrorActionPreference="Stop" で止まらないように）
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "コミット済みのため commit は飛ばします。" -ForegroundColor Yellow
} else {
git commit -m "FRANK: お客様の入口を my.frankgolf.jp に一本化し、入会承認の前に決済を確かめられるようにした (#188)" -m @"
ユーザー指摘:
  入会時、決済ボタンを押さなくても入会を承認できてしまうので、
  実際に決済画面で決済されているかを確認したい。
  iCloud.com 宛にメールが行っていないことがあった。
  メールの「打席予約はこちら」がややこしいので全部 my.frankgolf.jp に飛ばしたい。
  お客様が入るページは会員ポータルだけにしたい。簡易ログインQRのPDFも欲しい。

1. 承認画面に「決済がどこまで進んだか」を必ず出す
   Web入会は入金Webhookで自動確定するので、承認待ちに残っている pending は
   「まだ払っていない人」か「Webhookが届かなかった人」のどちらか。
   画面では見分けが付かないまま【承認して会員化】が押せた。

2. 答えは Square に聞きに行く
   決済リンクの注文ID -> 見つからなければ申込メールから顧客をたどって完了注文を探す。
   （サブスク付き決済リンクの入金は別の注文IDで届く・#137 の実障害）
   Square env は yozan-genesis にしか無いので照会はgenesis側の公開APIに置いた。

3. 入金が確認できたら Web入会と同じ手順で確定する
   手動の承認では会員番号のメールしか出ない（控えPDF・カルテが付かない）。
   【承認して会員化】は現金・振込・口座振替の入口として残した。

4. お客様が入るページは my.frankgolf.jp 1つにする
   URLの正典は packages/core/src/frank-links.ts。ここ以外に直書きしない。
   打席予約の画面もポータルの中に置いた（台帳とAPIは1本のまま）。
   月会費のカード登録も「設定・お手続き」に移した。
   体験のキャンセルURLも /cancel/<token> 経由にした（画面は従来のまま）。

5. iCloud宛の未達は送信元の設定が原因ではない
   frankgolf.jp の SPF / DKIM / DMARC は実測で正しく揃っていた。
   毎回あてずっぽうで切り分けないで済むように、送信結果に Resend の message id を
   持ち帰るようにし、入会完了メールの成功・失敗を events に記録するようにした。

6. 簡易ログインQRのA4ポスター（店頭掲示用の共通QR）
   中身は my.frankgolf.jp/member/login だけ＝誰が読み取っても同じ。
   会員ごとの自動ログインQRは作らない（掲示物や写真から他人が入れるため）。

tsc（genesis / member-os）通過・next build 通過（クラウドでcloneして実走）
tests 518件パス（新規4件）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SYYxiYDnAPCBuWmmM4KoUj
"@
}

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel が READY になったら次の順で確認してください。" -ForegroundColor Green
Write-Host " 1. my.frankgolf.jp/member/login にログイン → 【＋ 打席を予約する】がポータルの中で開く" -ForegroundColor Cyan
Write-Host " 2. 枠を選んで予約 → 会員ページの「これからのご予約」に出る" -ForegroundColor Cyan
Write-Host " 3. 「設定・お手続き」に【カードを登録する】が出る（月会費のあるプランの方だけ）" -ForegroundColor Cyan
Write-Host " 4. member-os /frunk の承認待ちに『決済: ...』が出る → 【Squareで入金を確認】" -ForegroundColor Cyan
Write-Host ""
Write-Host "iCloud宛の未達は Resend の Logs で Delivered / Bounced を確認してください。" -ForegroundColor Yellow
Write-Host "簡易ログインQRのポスターは FRANK_GOLF_出店計画\FRANK_会員ポータルQR_A4.pdf です。" -ForegroundColor Yellow
