# ============================================================
# craft-os: フィッティング表紙・見積・注文書・工房の組立指示（新アプリ）
#
# 使い方:
#   ファイルはすでにプロジェクトフォルダに置いてあります。PowerShell で:
#        cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#        .\deploy-craft-os.ps1
#
# ※ DB（migration 0160〜0167）は適用済みです。環境変数の追加はありません
# ※ push のあと、Vercel で craft-os プロジェクトを新規作成する作業が残ります（NEXT_TASKS A-237）
# ============================================================
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
$ErrorActionPreference = "Continue"
function Die($m) { Write-Host ""; Write-Host "■ 中止: $m" -ForegroundColor Red; exit 1 }

foreach ($lock in @(".git\index.lock", ".git\HEAD.lock", ".git\refs\heads\main.lock", ".git\refs\remotes\origin\main.lock")) {
  if (Test-Path $lock) { Write-Host "stale な $lock を削除します" -ForegroundColor Yellow; Remove-Item $lock -Force }
}
$head = (git symbolic-ref -q --short HEAD)
if (-not $head)       { Die "HEADが切り離されています。先に  git checkout main  を実行してください。" }
if ($head -ne "main") { Die "main 以外のブランチ（$head）にいます。" }

git fetch origin main 2>$null

$files = @(
  "apps/craft-os/README.md",
  "apps/craft-os/next-env.d.ts",
  "apps/craft-os/next.config.ts",
  "apps/craft-os/package.json",
  "apps/craft-os/postcss.config.mjs",
  "apps/craft-os/src/app/actions.ts",
  "apps/craft-os/src/app/api/logout/route.ts",
  "apps/craft-os/src/app/api/v1/health/route.ts",
  "apps/craft-os/src/app/demo-shafts/actions.ts",
  "apps/craft-os/src/app/demo-shafts/link-row.tsx",
  "apps/craft-os/src/app/demo-shafts/page.tsx",
  "apps/craft-os/src/app/globals.css",
  "apps/craft-os/src/app/layout.tsx",
  "apps/craft-os/src/app/login/actions.ts",
  "apps/craft-os/src/app/login/page.tsx",
  "apps/craft-os/src/app/page.tsx",
  "apps/craft-os/src/app/q/[id]/actions.ts",
  "apps/craft-os/src/app/q/[id]/layout.tsx",
  "apps/craft-os/src/app/q/[id]/page.tsx",
  "apps/craft-os/src/app/q/[id]/print/[doc]/page.tsx",
  "apps/craft-os/src/app/q/[id]/quote/page.tsx",
  "apps/craft-os/src/app/q/[id]/quote/product-picker.tsx",
  "apps/craft-os/src/app/q/[id]/work/actions.ts",
  "apps/craft-os/src/app/q/[id]/work/page.tsx",
  "apps/craft-os/src/components/guest-picker.tsx",
  "apps/craft-os/src/components/nav.tsx",
  "apps/craft-os/src/components/print-frame.tsx",
  "apps/craft-os/src/components/ui.tsx",
  "apps/craft-os/src/lib/auth.ts",
  "apps/craft-os/src/lib/craft.ts",
  "apps/craft-os/src/lib/format.ts",
  "apps/craft-os/src/middleware.ts",
  "apps/craft-os/tsconfig.json",
  "packages/core/package.json",
  "packages/core/src/fitting-quote.ts",
  "supabase/migrations/0160_craft_os.sql",
  "supabase/migrations/0161_craft_os_seed_rules.sql",
  "supabase/migrations/0162_craft_os_norm_fn.sql",
  "supabase/migrations/0163_craft_os_rules_2026_09_12.sql",
  "supabase/migrations/0164_craft_os_move_to_public.sql",
  "supabase/migrations/0165_craft_os_fitting_trials.sql",
  "supabase/migrations/0166_craft_os_fixes.sql",
  "supabase/migrations/0167_craft_os_permission.sql",
  "tests/craft-rules-vs-actual.test.ts",
  "tests/fitting-quote.test.ts",
  "tests/fixtures/craft-discount-rules.json"
)

git --literal-pathspecs add -- $files
$addExit = $LASTEXITCODE
$staged = @(git diff --cached --name-only)
Write-Host ""
Write-Host "--- ステージされたファイル ($($staged.Count) 件) ---" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "   $_" }
if ($addExit -ne 0) { Die "git add が失敗しました（終了コード $addExit）。" }
$missing = @($files | Where-Object { $f = $_; -not ($staged | Where-Object { $_ -eq $f }) })
if ($missing.Count -gt 0) { Die "次のファイルがステージに乗っていません:`n   $($missing -join "`n   ")" }

$checks = @(
  @("packages/core/src/fitting-quote.ts", "export function computeFittingRefund"),
  @("packages/core/src/fitting-quote.ts", "export function resolveDiscount"),
  @("packages/core/package.json", "./fitting-quote"),
  @("apps/craft-os/src/lib/craft.ts", "export async function getQuote"),
  @("apps/craft-os/src/app/q/[id]/work/actions.ts", "export async function saveSpecs"),
  @("supabase/migrations/0166_craft_os_fixes.sql", "gw_next_quote_seq")
)
foreach ($c in $checks) {
  if (-not (git show ":$($c[0])" | Select-String -SimpleMatch $c[1])) { Die "$($c[0]) に「$($c[1])」がありません。" }
}
Write-Host "本体の中身を確認しました。" -ForegroundColor Green

npm test
if ($LASTEXITCODE -ne 0) { Die "テストが落ちました。commit していません。" }

git commit -m "craft-os: フィッティング表紙・見積・注文書・工房を1本に（2冊のExcelを置き換え）" -m @"
ユーザー決定（2026-09-12）:
  - 設置場所は新アプリ apps/craft-os（発注管理アプリには触らない）
  - シャフトの割引はメーカー別「シャフト割引率表」が正（-20/-30/-10%、REVE等は-15/-25/-5%）
  - クラブのビジターは原則 割引なし。フィッティング歴あり・旧会員などは20%OFF（明細で打ち替え可）
  - ボールはタイトリストのみ割引なし、他メーカーは会員10%OFF
  - スタッフ購入は仕入値（商品マスタの掛け率）で自動
  - 工房は目標（範囲）＋組み上がりの実測値の両方を残す
  - フィッティング料の返金は消費税のあとに税込で差し引く

仕組み:
  - 定価は持たない。正典は golfwing.products（読み取りビュー public.gw_products）
  - 試打シャフト1,490本を gw_demo_shafts に取り込み、1,367本(91.7%)を商品マスタへ自動紐づけ
    残り123本は /demo-shafts の確認画面で人が選ぶ（うち61本はメーカーごとマスタ未登録）
  - 計算の正典は @yozan/core/fitting-quote 1か所（割引・フィッティング料返金・合計）
  - 表紙の試打11行 → そのまま見積へ（転記をなくす要）。買わなかったシャフトも gw_fitting_trials に残す
  - 注文書の進捗は紙の最終行そのまま（発注/到着/組立/REVE送信/お渡し/TD/お支払い）
  - 帳票は現行の紙と同じレイアウト（御見積書・御注文書＝A4縦、組立指示書＝A4横）
  - 割引の手動上書きは「誰が・いつ・なぜ」を記録。自分が作った見積は自分で社内確認できない
  - マスタに無い商品を手入力できる行を必ず残す（Excelの自由度を殺すと紙に戻るため）
  - migration 0160〜0167（適用済）／権限 use_craft を6ロールに付与済み

分かったこと（実データ）:
  - 表紙用と見積用の2冊で、同じ試打シャフトの定価が64件食い違っていた
  - Excelの定価は商品マスタより古く、202本が安く出ていた（差額合計 1,078,000円）
  - 実売上228件のシャフト販売のうち81%が割引率表の3つの率（0.8/0.7/0.9）に乗っていた

tests: fitting-quote 25件・craft-rules-vs-actual 8件パス

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GqfDsLxfXf3WPUwbezxfsA
"@
if ($LASTEXITCODE -ne 0) { Die "commit に失敗しました。" }

git pull --no-rebase --no-edit origin main
if ($LASTEXITCODE -ne 0) { Die "git pull（取り込み）に失敗しました。commit は済んでいます。表示を貼ってください。" }
git push origin main
if ($LASTEXITCODE -ne 0) { Die "push に失敗しました。" }

$local  = (git rev-parse HEAD).Trim()
$remote = (git ls-remote origin main).Split()[0].Trim()
if ($local -ne $remote) { Die "push したのに remote が $remote のままです（local $local）。" }
Write-Host ""
Write-Host "remote main = $remote （ローカルと一致）" -ForegroundColor Green
Write-Host ""
Write-Host "次にしていただくこと（NEXT_TASKS A-237）:" -ForegroundColor Cyan
Write-Host "  1. Vercel で craft-os のプロジェクトを新規作成（Root Directory = apps/craft-os）" -ForegroundColor Green
Write-Host "     環境変数は他のアプリと同じ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY" -ForegroundColor Green
Write-Host "  2. READY になったら開いて、Q-0001【動作確認用】見本 太郎 で表紙→見積→注文書→印刷 を一度なぞる" -ForegroundColor Green
Write-Host "  3. 確認できたら Q-0001 は削除してください（見本です）" -ForegroundColor Green
