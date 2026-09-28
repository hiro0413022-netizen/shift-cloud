# ============================================================
# #161 【重要】モバイルオーダーの決済が全件失敗していた不具合の修正
#       ＋ #160 重複会員 FR0004 の統合（DB側は実施済み）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-idempotency-161.ps1
#
# ★ migration なし。**これを当てるまでモバイルオーダーの自動決済は通りません**
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/member-os/src/lib/frank-square.ts" `
  "packages/core/src/frank-portal.ts" `
  "tests/frank-portal.test.ts" `
  "docs/genesis/DECISIONS.md" `
  "NEXT_TASKS.md"

git status --short

git commit -m "fix(frank): Squareの冪等キーが45文字超でモバイルオーダーの決済が全件失敗していた (#161)" -m @"
小川さんの実機テスト（FR0005・A打席・コーヒー300円）で発覚。

原因:
  #154 で入れた `frank-order-${orderId}` が 12 + UUID36 = 48文字。
  Square Payments API の idempotency_key の上限は 45文字で、400 が返っていた。
  chargeOrderOnFile が必ず失敗し、全注文が「未決済（退店時会計）」にフォールバック。
  注文自体は設計どおり止まらないため画面上は正常に見え、
  frunk_orders.payment_error を見るまで気づけなかった。

修正:
  - 接頭辞を fo- にして39文字に収めた
  - 組み立てを packages/core の squareOrderIdempotencyKey() に集約
  - 長さをテストで固定（tests/frank-portal.test.ts・401件全通過）

あわせて #160（重複会員 FR0004 を FR0002 に統合）を記録。
消す前に lsn_* のぶら下がり（動画1/コメント1/計測1/進捗9/共有トークン1）を
FR0002 側へ付け替えている。会員を消す前は必ずカルテを数えること。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AFrZDexNjMjDe1en5nhtvT
"@

git push origin main

Write-Host ""
Write-Host "push 完了。member-os が READY になったら、小川さんにもう一度" -ForegroundColor Green
Write-Host "ドリンク1品の注文を試してもらってください（今度は決済済になります）。" -ForegroundColor Green
