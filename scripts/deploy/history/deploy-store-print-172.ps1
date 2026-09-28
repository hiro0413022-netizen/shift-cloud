# ============================================================
# #172 店舗ダッシュボードから紙シフト（A4横）を印刷
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-store-print-172.ps1
#
# migration なし。push だけで反映されます。
# （#171 のスタッフ並べ替えは push 済み: d372e30）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/shift-cloud/src/components/shift-print.tsx" `
  "apps/shift-cloud/src/components/print-button.tsx" `
  "apps/shift-cloud/src/app/admin/shifts/print/page.tsx" `
  "apps/shift-cloud/src/app/admin/shifts/print/print-button.tsx" `
  "apps/shift-cloud/src/app/store/print-view.tsx" `
  "apps/shift-cloud/src/app/store/print/page.tsx" `
  "apps/shift-cloud/src/app/store/[token]/print/page.tsx" `
  "apps/shift-cloud/src/app/store/store-client.tsx" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md"

git status --short

git commit -m "feat(shift-cloud): 店舗ダッシュボードから紙シフトを印刷できるようにした (#172)" -m @"
ユーザー依頼「店舗ダッシュボードからも紙シフト印刷できるように」。

原因:
  紙シフトは /admin/shifts/print にしかなく requireActor(create_shifts) が要る。
  店頭の共有端末（店舗ログイン／kioskトークン）からは開けず、
  刷るたびに管理者アカウントで入り直していた。

変更:
  - 紙の本体を components/shift-print.tsx に切り出し、/admin/shifts/print は
    その薄いラッパにした（紙の体裁を2箇所に持たない）
  - /store/print（店舗ログインCookie）と /store/<token>/print（端末トークン）を新設
  - 店舗側は認証で解決した1店舗に固定。?store= の直打ちは効かず切替タブも出さない
    （オーナーがスタッフとしてもログインしている場合のみ複数）
  - ダッシュボードのシフト表見出しに「紙シフトを印刷」。いま見ている月・半月を
    そのまま持っていく（?ym=&range=half1|half2）
  - PrintButton も components/print-button.tsx へ移動（旧パスは再エクスポートstub）

注意:
  紙の中身は従来どおりその店舗の在籍スタッフ全員（役職でグルーピング）。
  ダッシュボードのグリッド（その月にシフトがある人だけ）とは母集団が違う。
  行順はどちらも staff.sort_order（#171）。

検証:
  npx tsc --noEmit 通過 / 既存テスト425件パス

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NLVxM6BWTD6RrMmc8EE1k3
"@

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel のビルドを私が見ています。" -ForegroundColor Green
