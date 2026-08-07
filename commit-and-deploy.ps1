# FRANK: 会員登録を入会申込に一本化＋受付メール＋バーガー無反応を修正（#120）
# 内容: /member/register(仮会員P########)を廃止して /join-web に一本化、
#       会員ログインを会員番号＋電話下4桁(frunk_members)に統一、
#       /join-web の受付メール(Resend)＋二重申込ガード、入会導線の追加、
#       site.js の init() 二重実行によるバーガーメニュー無反応の修正。
# 実行方法:
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"; .\commit-and-deploy.ps1

Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

Write-Host "[1/6] gitロックファイルを掃除..." -ForegroundColor Cyan
Remove-Item ".git\HEAD.lock",".git\index.lock",".git\refs\heads\main.lock",".git\MERGE_HEAD.lock",".git\ORIG_HEAD.lock" -Force -ErrorAction SilentlyContinue

Write-Host "[2/6] 型チェック（VMのマウントIO不調で未完走のため、ここで実行）..." -ForegroundColor Cyan
npx tsc -p apps\member-os\tsconfig.tscheck.json --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Host "tscエラーあり。コミットを中止しました。エラー内容をClaudeに貼ってください。" -ForegroundColor Red
    exit 1
}

Write-Host "[3/6] コミット（今回の変更ファイルのみ・demo-sales/prospect等の並行作業は含めない）..." -ForegroundColor Cyan
git add sites/frank-golf apps/member-os/src `
        docs/genesis/DECISIONS.md docs/modules/frank/RESERVATION_SYSTEM.md `
        NEXT_TASKS.md commit-and-deploy.ps1
git commit -m "fix(frank): 会員登録を入会申込に一本化・受付メール・バーガー無反応を修正 (#120)"

Write-Host "[4/6] リモートと統合（衝突はローカル優先）..." -ForegroundColor Cyan
git pull --no-rebase --no-edit -X ours origin main
git diff --name-only --diff-filter=U | ForEach-Object { git checkout --ours -- "$_" }

Write-Host "[5/6] 統合をコミット..." -ForegroundColor Cyan
git commit -am "merge: リモート統合（ローカル優先）" 2>$null

Write-Host "[6/6] プッシュ（Vercelが自動デプロイ）..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "完了。2-3分後に frank-golf と member-os のデプロイが終わります。" -ForegroundColor Green
Write-Host "確認手順:" -ForegroundColor Green
Write-Host "  1. スマホで frankgolf.jp/booking.html を開き、右上の三本線をタップ → メニューが開く" -ForegroundColor Gray
Write-Host "  2. メニューとフッターに「入会のお申し込み」が出ている" -ForegroundColor Gray
Write-Host "  3. 入会のお申し込みから1件送信 → 受付メールが届く（RESEND_API_KEY設定後）" -ForegroundColor Gray
Write-Host "  4. member-os の「FRANK会員」で承認 → 会員番号(F0001…)を控えてお客様へ連絡" -ForegroundColor Gray
Write-Host "  5. その番号＋電話下4桁で booking.html から予約できる" -ForegroundColor Gray
Write-Host ""
Write-Host "※ Vercel(member-os) に RESEND_API_KEY / FRANK_MAIL_FROM を設定するまでメールは飛びません" -ForegroundColor Yellow
