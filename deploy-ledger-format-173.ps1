# ============================================================
# #173 一時利用者名簿Excel: 日付を 2026/08/28、電話を 090-1234-5678 の形に
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-ledger-format-173.ps1
#
# migration なし。push だけで反映されます（#171/#172 は push 済み）。
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/member-os/src/lib/ledger-format.ts" `
  "apps/member-os/src/app/api/ledger-export/route.ts" `
  "tests/ledger-format.test.ts" `
  "docs/genesis/DECISIONS.md" `
  "CHANGELOG.md"

git status --short

git commit -m "change(member-os): 名簿Excelの日付をスラッシュ区切り・電話をハイフン区切りに (#173)" -m @"
ユーザー依頼「日付は 2026/08/28、電話番号は 090-0000-0000 の形にしてほしい」。

変更:
  - 日付5列（日付・生年月日・再来の場合日付記入・再アプローチ(日付)×2）を
    YYYY/MM/DD で出力。列は numFmt='@' に固定してExcelが勝手に直さないようにした
  - 電話番号を 090-1234-5678 の形に整形
    （数字だけ11桁 / 全角ハイフン / スペース区切り / +81始まり / ハイフン位置ちがい）
  - 書式は lib/ledger-format.ts（ymdSlash / formatTel）に切り出し

触らないもの（意図的）:
  メモ書き付き「090-4300-5336（母弘子様携帯」、2件併記「06-…・090-…」、
  桁数が合わないもの、市外局番の切れ目が判らない固定電話10桁は原文のまま。
  実データ6,200件中5,684件は既に正しい区切りで、数字だけ抜いて組み直すと
  併記された情報が消える。0797-81-1234 と 079-781-1234 はどちらも10桁で、
  表がないと切れ目を決められない。

往復:
  取込側 import/actions.ts の cellDate は '/' 区切りも受けるので、
  出した名簿をそのまま取り込み直せる。

検証:
  npx tsc --noEmit 通過 / tests/ledger-format.test.ts 12件を追加し全437件パス

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01NLVxM6BWTD6RrMmc8EE1k3
"@

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel のビルドを私が見ています。" -ForegroundColor Green
