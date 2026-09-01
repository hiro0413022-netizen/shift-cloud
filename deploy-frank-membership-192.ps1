# ============================================================
# #192 FRANK 退会・休会を「いつから」で受け付け、Squareの月会費を必ず止める
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-membership-192.ps1
#
# ※ migration 0139 は適用済みです（DBは先に直してあります）
# ※ ファイルは編集済み・git add 済みです。このスクリプトは commit と push だけ行います
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

# Cowork 側は .git の一時ファイルを消せないため、コミット途中の lock が残っています
foreach ($f in @(".git\HEAD.lock", ".git\index.lock", ".git\COMMIT_EDITMSG.lock")) {
  if (Test-Path $f) { Remove-Item $f -Force; Write-Host "removed $f" -ForegroundColor Yellow }
}
Get-ChildItem -Path ".git\objects" -Recurse -Filter "tmp_obj_*" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

git add -- `
  "packages/core/src/frank-membership.ts" `
  "packages/core/package.json" `
  "tests/frank-membership.test.ts" `
  "apps/member-os/src/lib/frank-square.ts" `
  "apps/member-os/src/app/(main)/frunk/actions.ts" `
  "apps/member-os/src/app/(main)/frunk/page.tsx" `
  "apps/member-os/src/app/(main)/frunk/[id]/page.tsx" `
  "apps/genesis/src/lib/frank-membership-cron.ts" `
  "apps/genesis/src/app/api/cron/daily/route.ts" `
  "supabase/migrations/0139_frank_scheduled_leave_suspend.sql" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "deploy-frank-membership-192.ps1"

git status --short

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "コミット済みのため commit は飛ばします。" -ForegroundColor Yellow
} else {
git commit -m "FRANK: 退会・休会を「いつから」で受け付け、Squareの月会費を必ず止めるようにした (#192)" -m @"
ユーザー指摘:
  会員の削除や会員プランの変更を行ったときにスクエアの請求もとまりますか？
  会員プランを作って保存したのにプラン変更できない
  退会時と休会時（〇月末の退会と選べるように）に請求を止めてください

1. 退会してもSquareの自動課金は止まっていなかった
   休会(pause)と復帰(resume)は動いていたが、退会だけ意図的にSquareを触らず
   「ダッシュボードで解約してください」と赤字を出すだけだった。
   見落とすと翌月も引き落とされる。プランを削除してもサブスクは止まらない。
   会員そのものを消す機能は無い（退会にするだけ）。

2. 退会・休会は「いつから」を選んで受け付ける
   退会=月末（申し出の翌月末から）／休会=月初（10日までなら翌月・11日以降は翌々月）。
   月末以外・月初以外の日付は受け付けない＝日割りを発生させない。
   選択肢の生成もサーバーの検証も同じ純関数（@yozan/core/frank-membership）を通す。

3. お金はcronに依存させない
   受付の時点でSquare側に予約を入れる。
   退会 = PUT /v2/subscriptions/{id} の canceled_date（その月まで請求・翌月から停止）
   休会 = pause の pause_effective_date
   cronが遅れても請求は正しい日付で止まる。
   ⚠ SquareのPOST /cancel は即時ではなく現在の請求サイクルの終わりで効く。

4. statusは当日まで変えない
   予定日までは在籍のまま＝予約も会員証も通常どおり。
   切り替えは genesis の日次cron（6:00 JST・runFrankMembershipSchedule）。
   退会日は「その日までは在籍」なので翌日に left へ落とす。

5. 予約は取り消せる
   DBの予定日を消すだけでなくSquare側も戻す（canceled_date:null / resume）。
   片方だけ戻すのがいちばん危ない。

6. 0円プランに変更できなかった
   プラン変更のプルダウンが monthly_price>0 で絞っていたため、
   保存はできているのに変更先に出てこなかった（スタッフ・モニター会員）。
   0円プランへ変更したら自動課金を解約する。
   swapで済ませると0円のバリエーションが無く旧プランの金額のまま落ち続ける。

7. 予定は一覧と会員カードにバッジで出す
   店頭で気づけないと、退会予定の人の予約を取ってしまう。

migration 0139 適用済み（scheduled_leave_date / scheduled_suspend_start）
member-os / genesis の tsc --noEmit と next build 通過（クラウドでcloneして実走）
tests 548件パス（新規14件）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0171JzpCc7kcd7TBBCs68mDu
"@
}

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel が READY になったら次の順で確認してください。" -ForegroundColor Green
Write-Host " 1. member-os の会員管理 → 会員カードを開く" -ForegroundColor Cyan
Write-Host " 2. プラン変更のプルダウンに「スタッフ（月会費なし）」が出る" -ForegroundColor Cyan
Write-Host " 3. 退会：プルダウンに 2026年10月末 から並ぶ（9月末は出ない）" -ForegroundColor Cyan
Write-Host " 4. 休会：9月10日までなら 2026年10月から が選べる（11日以降は11月から）" -ForegroundColor Cyan
Write-Host " 5. 受け付けると『◯月末で退会予定』バッジが出て、取り消しボタンも出る" -ForegroundColor Cyan
Write-Host ""
Write-Host "残り: 小川うらら様(FR0005)のSquareサブスク（月100円）の解約" -ForegroundColor Yellow
Write-Host "  会員カードの『自動課金』の欄に【自動課金を解約する】が出ます。それを押せば止まります。" -ForegroundColor Yellow
Write-Host "  （Squareの解約は即時ではなく、現在の請求期間の終わりで停止します）" -ForegroundColor Yellow
