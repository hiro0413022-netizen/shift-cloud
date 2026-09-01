# ============================================================
# #193 Member OS: タブを店頭の順に並べ替え／予約を1画面に統合／カレンダーのマスをタップして予約
# #194 Lesson OS: スマホで見やすくした
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-tap-booking-193.ps1
#
# ※ migration はありません
# ※ 他の作業（#192 退会・休会とSquare）は別コミットのままにしてあります
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/member-os/src/components/nav.tsx" `
  "apps/member-os/src/components/bay-timeline.tsx" `
  "apps/member-os/src/app/(main)/reservations/page.tsx" `
  "apps/member-os/src/app/(main)/reservations/actions.ts" `
  "apps/member-os/src/app/(main)/reservations/booking-sheet.tsx" `
  "apps/member-os/src/app/(main)/dashboard/page.tsx" `
  "apps/member-os/src/app/(main)/dashboard/frank-calendar.tsx" `
  "apps/lesson-os/src/app/globals.css" `
  "apps/lesson-os/src/components/nav.tsx" `
  "apps/lesson-os/src/lib/device.ts" `
  "apps/lesson-os/src/app/(main)/layout.tsx" `
  "apps/lesson-os/src/app/(main)/page.tsx" `
  "apps/lesson-os/src/app/(main)/students/[id]/karte-client.tsx" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md" `
  "NEXT_TASKS.md" `
  "deploy-frank-tap-booking-193.ps1"

git status --short

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "コミット済みのため commit は飛ばします。" -ForegroundColor Yellow
} else {
git commit -m "Member OS: タブを店頭の順に並べ替え、予約を1画面に統合し、カレンダーのマスをタップして予約できるようにした (#193) / Lesson OS: スマホで見やすくした (#194)" -m @"
ユーザー指示:
  ダッシュボードでのスケジュール管理が一番よく見る画面。上の並び替えをしてください。
  必要のない確認するだけのものは「その他」タブから開くように。
  体験予約を電話で受けたときの入れ方がすごく分かりづらい。枠を選択してスケジュールを引かないといけないのでややこしい。
  カレンダーの該当のところをタップしたら、そこから予約できるようにしたい。
  レッスンOSはスマホの画面がもう少し見やすいようにUIを変更してください。

1. タブが10個あって、探す時間のほうが長かった
   1日に何度も触るものと、月に数回しか開かないものが同じ重さで並んでいた。
   お客様が来てからの手の動き（受付台帳 → 予約 → FRANK会員 → 電子伝票 → チェックイン）を常時表示にし、
   確認するだけの4つ（体験申込・体験フォロー・来店検索・データ取込）を「その他」に畳んだ。

2. カレンダーで見る画面と、登録・入金する画面が別タブに分かれていた
   /dashboard と /reservations は同じ台帳の同じ日を別タブで開いていた。
   /reservations に統合し、FRANK配属者の /dashboard は転送する（?date= ?sel= は引き継ぐ）。

3. 電話で体験を受けたとき、スタッフには入口が無かった
   体験の予約はお客様向けの公式サイトにしかなく、スタッフは自分でそこを開いて
   お客様のふりをして入力していた。カレンダーの空きマスを押すと、その日・時刻・打席が入った
   入力パネルが開き、体験／会員・都度をタブで選んで登録できるようにした。

4. 体験の規則は member-os 側で作り直さない
   毎時00分・打席の自動割当・レフティ・生年月日必須・受付台帳連携・確定メールの正典は
   Genesis の /api/public/frank/trial。スタッフ画面からも同じAPIをサーバー間で呼ぶ。
   流入元は src=staff で渡すので、お客様ご自身の申込と受付台帳で区別できる。

5. 登録が失敗しても黙って何も起きなかった
   営業時間外・重複・会員未指定のいずれでも return するだけだった。理由を画面に出す。
   ついでにレッスン枠との重なりも見るようにした（打席のダブルブッキングが作れていた）。

6. Lesson OS がスマホで縦に伸びていたのは、モバイル対応として入れた一括CSSが原因
   globals.css の .grid-cols-* 書き換えが Tailwind の md: 指定を丸ごと打ち消していた
   （unlayered なCSSは @layer utilities より強い）。一括の書き換えをやめ、
   折り返しは各画面の md: に任せる。CSSに残すのは入力欄16px・44pxのタップ領域・
   表の横スクロール・safe-area だけ。

7. Lesson OS のヘッダとカルテのタブ
   スマホはヘッダの2段目に横スクロールのタブを出し、開いているタブに色を付けた。
   カルテの7タブも横スクロールに（折ると下の内容が画面から押し出されていた）。

8. スマホ判定はサーバー側にも持たせたが、見た目はCSSで決める
   lib/device.ts の isMobileDevice は初期値寄せ用。UAは偽装できるし新端末を取りこぼすので、
   これで動作は止めない。レイアウト最外に data-mobile を出してある。

member-os / lesson-os の tsc --noEmit 通過・next build 通過（クラウドでcloneして実走）
tests 548件パス

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01M6FmEUCjLwrRgb5tBW2hD5
"@
}

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel が READY になってから確認してください（#180）。" -ForegroundColor Green
Write-Host " 1. member-os の上のタブが 受付台帳／予約／FRANK会員／電子伝票／チェックイン＋その他 になっている" -ForegroundColor Cyan
Write-Host " 2. 【予約】タブで 月/週/日 が切り替わり、未収金・当日一覧も同じ画面にある" -ForegroundColor Cyan
Write-Host " 3. 日表示で空いているマスを押す → 体験タブ → 姓名・生年月日・電話・同意 →【体験を確定する】" -ForegroundColor Cyan
Write-Host " 4. 受付台帳にもその方の行ができていることを確認" -ForegroundColor Cyan
Write-Host " 5. iPhone で lesson-os を開き、タブが2段目に出る・生徒カードが2列・入力欄で画面が拡大しない" -ForegroundColor Cyan
Write-Host ""
Write-Host "体験の打席は自動割当です。特定の打席で取りたいときは、登録後に【日時・打席を変更】で移してください。" -ForegroundColor Yellow
