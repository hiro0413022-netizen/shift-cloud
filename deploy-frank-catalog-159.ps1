# ============================================================
# #159 レジ商品の投入を運用APIにする（トークンを手元にコピーしなくてよくなる）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-catalog-159.ps1
#
# ★ migration なし。push してデプロイされたら、こちらでAPIを叩いてレジ商品を作ります
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/genesis/src/app/api/public/frank/admin/square-catalog-sync" `
  "docs/genesis/DECISIONS.md" `
  "NEXT_TASKS.md"

git status --short

git commit -m "frank: レジ商品の投入を運用ワンショットAPIにした (#159)" -m @"
- scripts/frank-square-setup.mjs と同じことを本番環境自身にやらせる API を追加
  POST /api/public/frank/admin/square-catalog-sync
- 理由: SQUARE_ACCESS_TOKEN は Vercel env にしかなく、ローカル実行のたびに
  誰かがトークンを手元にコピーする必要があった（コピーが端末に残るリスクつき）
  #136 の square-plan-sync が同じ問題を既に解いていたので、同じ形にした
- 冪等: 同名の商品があればスキップ（何度叩いても増えない）
- 認証: gn_ops_tokens(purpose=frank_square_catalog_sync・期限内・sha256)
- 対象: 入会金11,000 / 休会費2,200 / ビジター利用料5,500 / 体験3,300 / レッスン単発25分2,500（税込）
- ⚠ 品目と価格の正典は setup.mjs の FEE_ITEMS。片方だけ直さないこと

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AFrZDexNjMjDe1en5nhtvT
"@

git push origin main

Write-Host ""
Write-Host "push 完了。yozan-genesis が READY になったら教えてください。" -ForegroundColor Green
Write-Host "こちらでレジ商品5件を投入します（トークンは触りません）。" -ForegroundColor Green
