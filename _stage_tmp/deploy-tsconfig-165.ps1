# ============================================================
# #165 【重要】ビルドが5本連続で失敗していた原因の修正
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-tsconfig-165.ps1
#
# packages/core の `.ts` 付き相対import を全アプリで許可する設定。
# これを当てるまで #162/#163/#164 と祝日判定は本番に出ません。
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- "apps/*/tsconfig.json" "docs/genesis/DECISIONS.md"

git status --short

git commit -m "fix(build): packages/core の拡張子つき相対importで全アプリの型チェックが落ちていた (#165)" -m @"
症状:
  git push は通るが Vercel が5本連続 ERROR。
  本番は bf5fe8d（#162より前）を配信し続けており、
  #162/#163/#164 と祝日判定がどれも出ていなかった。
  サイトは落ちないので画面上は気づけない。

  Type error: An import path can only end with a '.ts' extension
  when 'allowImportingTsExtensions' is enabled.
    packages/core/src/frank-booking.ts:14

原因:
  packages/core の中で相対importに .ts を付けると、
  core を読む全アプリの型チェックが落ちる。
  shift-cloud と swing-cortex だけ allowImportingTsExtensions が
  入っていたため、リポジトリ内の前例を見て問題ないと誤認した。

対応:
  noEmit:true を持つ全12アプリの tsconfig に
  allowImportingTsExtensions: true を追加（既存2アプリと同じ設定に統一）。
  拡張子を外す案は不採用。node --test が拡張子なしを解決できず
  テストが動かなくなるため。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AFrZDexNjMjDe1en5nhtvT
"@

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel のビルドを私が見ています。" -ForegroundColor Green
Write-Host "READY になったら /orders の一番上に「来店中」が出ます。" -ForegroundColor Green
