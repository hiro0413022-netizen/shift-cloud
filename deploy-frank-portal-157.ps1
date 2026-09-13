# ============================================================
# #157 リリース後の点検（時限爆弾テストの解体）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-portal-157.ps1
#
# ★ migration なし。DB作業なし（トークン発行はMCPで実施済み）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "apps/reserve-os/src/lib/reserve.ts" `
  "tests/reserve-bookable.test.ts" `
  "docs/genesis/DECISIONS.md" `
  "NEXT_TASKS.md"

git status --short

git commit -m "reserve-os: isBookableの時刻依存テストを解体（基準日を渡せるように） (#157)" -m @"
- tests/reserve-bookable.test.ts が基準日を渡さず「今日」に依存しており、
  2026-08-26 11:00 を過ぎた瞬間から毎回落ちる時限爆弾だった
- isBookable に from（既定=今日＝本番挙動は不変）を追加し、テストは基準日を固定
- テスト399件 全通過に復帰
- あわせて #157 の点検結果（本番スモーク・保存カード0名の確認・トークン先行発行）を DECISIONS に記録

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AFrZDexNjMjDe1en5nhtvT
"@

git push origin main

Write-Host ""
Write-Host "push 完了。これで #154〜#157 まで全部本番に載ります。" -ForegroundColor Green
