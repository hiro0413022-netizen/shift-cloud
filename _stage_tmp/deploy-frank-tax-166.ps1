# ============================================================
# #166 モバイルオーダーを外税に（メニュー価格＝税抜の本体価格）
# #167 ドリンクの売価を一律に（ソフト330/660・ノンアル440/880・税込）
#
#   cd "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"
#   .\deploy-frank-tax-166.ps1
#
# migration 0127 / 0128 は MCP で本番適用済み（ファイルは記録用）。
# 例: コーヒー会員価格300円 → 請求 330円（300 + 消費税30）
# ============================================================
$ErrorActionPreference = "Stop"
Set-Location "C:\Users\hiro0\Claude\Projects\YOZAN GENESIS"

git add -- `
  "supabase/migrations/0127_frank_order_tax.sql" `
  "supabase/migrations/0128_frank_menu_price_flat.sql" `
  "packages/core/src/frank-tax.ts" `
  "packages/core/src/frank-portal.ts" `
  "packages/core/package.json" `
  "apps/member-os/src/lib/frank-portal.ts" `
  "apps/member-os/src/lib/frank-terms.ts" `
  "apps/member-os/src/app/orders/actions.ts" `
  "apps/member-os/src/app/orders/page.tsx" `
  "apps/member-os/src/app/orders/menu/page.tsx" `
  "apps/member-os/src/app/member/order/order-form.tsx" `
  "sites/frank-golf/_build.py" `
  "sites/frank-golf/terms.html" `
  "sites/frank-golf/tokushoho.html" `
  "tests/frank-portal.test.ts" `
  "docs/genesis/DECISIONS.md"

git status --short

git commit -m "feat(frank): モバイルオーダーを内税から外税に（メニュー価格＝税抜の本体価格） (#166)" -m @"
ユーザー指定「商品価格が300円（内税になっています）ので、300円＋消費税に」。

変更:
  - frunk_menu_items.price_* の意味を「税抜の本体価格」に変更
    コーヒー会員価格300円 → 請求330円（300 + 消費税30）
  - 税率10%（打席へお持ちする＝店内飲食。軽減税率8%は持ち帰りの扱い）
  - 税は明細ごとではなく税抜合計に1回だけかける
    （1個ずつ2回と2個まとめてで総額がずれないように・テストで固定）
  - migration 0127: frunk_orders に subtotal / tax_rate / tax_amount
    税率を行に残すのは、改定しても過去の伝票が変わらないようにするため
    #166以前の行は tax_rate=0 で埋めた（当時は税込価格だった事実を保存）
  - お客様の表示は税込を主（総額表示義務・消費税法63条）
    単価「¥330（税込）」、合計の横に「（税抜¥300 ＋ 消費税¥30）」
  - メニュー管理は逆に「税抜で入力」と明示し、各行に税込を併記
  - 税計算は packages/core/src/frank-tax.ts に切り出し（node非依存）
    注文画面が同じ計算を読むため。画面側にコピーすると表示と請求が
    ずれても誰も気づけない（#161と同じ壊れ方）
  - linkOrderToMember でも税を足す（忘れると会員だけ税抜で請求される）
  - 規約 第9条2項と特商法に「注文代金は税込価格」を追記
    member-os と公式サイトの両方・サイトは再生成済み

Money OS は変更なし（Squareの税込金額から exTax で税抜を出しており、
むしろ今回で正確になった）。
レジ商品（Squareカタログ）は従来どおり税込。混同しないこと。

#167 ドリンクの売価を一律にした（ユーザー確定値）。
  決めたのは「お客様が払う額（税込）」:
    ソフトドリンク  会員330 / ビジター660
    ノンアルコール  会員440 / ビジター880
  DBには本体価格 300/600・400/800 を入れた（4つとも110で割り切れる＝端数なし）。
  ソフトドリンク = DRINK + FRANK SPECIAL、ノンアルコール = NON-ALCOHOL。
  プロテインドリンクとノンアルモヒートは取り扱い終了。
  ⚠ 行は消さず active=false（過去の伝票の紐付けを壊さないため）。

テスト425件 全通過。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01AFrZDexNjMjDe1en5nhtvT
"@

git push origin main

Write-Host ""
Write-Host "push 完了。Vercel のビルドを私が見ています。" -ForegroundColor Green
Write-Host "READY になったら /member/order で 全品「¥330（税込）」 になっているか確認してください。" -ForegroundColor Green
