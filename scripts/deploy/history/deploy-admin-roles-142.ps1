# ============================================================
# #142 Shift Cloud: ロール・権限の編集画面 /admin/roles
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-admin-roles-142.ps1
#
# migration なし（コードのみ）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/shift-cloud/src/app/admin/roles" `
  "apps/shift-cloud/src/lib/permissions.ts" `
  "apps/shift-cloud/src/app/admin/layout.tsx" `
  "docs/genesis/DECISIONS.md" `
  "NEXT_TASKS.md"

git status --short

git commit -m "shift-cloud: ロール・権限の編集画面 /admin/roles を追加 (#142)" -m @"
権限を編集するUIがどのアプリにも無く、付与のたびにDB直編集していた（#141が実例）。

- /admin/roles（オーナー限定）: ロールごとに権限をチェックでON/OFF
- 「使っている人（n人）＋氏名」を常時表示＝誰に効くかが分かった上で変更する
- 同名ロールを赤バッジで警告し、更新は必ずID（コーチング（店舗）は本番に2つある）
- 締め出し防止: オーナーロールをゼロにできない／自分のロールからオーナーを外せない／
  read_only は他権限と併用不可。いずれもサーバーアクション側で判定
- lib/permissions.ts のカタログに無いキーは保存時も消さず持ち越す
- 削除は「標準でない・誰も使っていない」ロールのみ。全変更を audit_logs に記録

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017nQhgkA9MgirJV91C6m3PJ
"@

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel の shift-cloud が READY になったら /admin/roles を開いてください。" -ForegroundColor Green
