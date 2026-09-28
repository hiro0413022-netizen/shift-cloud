# ============================================================
# #159b 運用記録（レジ商品の投入完了・公式LINE URL設定）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-ops-159b.ps1
#
# ★ コード変更なし。ドキュメントだけの更新です
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- "docs/genesis/DECISIONS.md" "NEXT_TASKS.md"
git status --short

git commit -m "docs: レジ商品の投入完了と公式LINE URL設定を記録 (#159b)" -m @"
- レジ商品3件をSquareに投入済み（ビジター5,500 / 体験3,300 / レッスン単発25分2,500）
  入会金・休会費は既存のためスキップ＝冪等が意図どおり効いた
  SQUARE_ACCESS_TOKEN は誰も手元にコピーしていない（運用APIが本番環境自身に作らせた）
- 公式LINEの友だち追加URL https://lin.ee/Xl0L2k7 を NEXT_PUBLIC_FRANK_LINE_URL に設定・再デプロイ
- Vault更新: 「スクエア」に追記＋「FRANK 会員ポータル（お客様用）」を新規登録
- ⚠ SQUARE_ACCESS_TOKEN は Vault 未保存。Vercelで表示できる（type=encrypted）ので控えること

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AFrZDexNjMjDe1en5nhtvT
"@

git push origin main

Write-Host ""
Write-Host "push 完了。残るユーザー作業は 物販リスト・ロゴ画像・Square本番切替(小川さん)・Tera 9200 だけです。" -ForegroundColor Green
