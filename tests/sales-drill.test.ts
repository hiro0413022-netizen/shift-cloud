import test from "node:test";
import assert from "node:assert/strict";
import { allocate, buildDrill, factsWithItem, itemKey, ledgerCategory, nameFromMemo, NO_NAME, type SaleFact } from "../apps/money-golfwing/src/lib/sales-drill.ts";
import { itemsMemo, squareLineItems } from "../apps/genesis/src/lib/frank-pos-pure.ts";

const f = (p: Partial<SaleFact>): SaleFact => ({
  id: Math.random().toString(36), date: "2026-09-10", category: "利用料", amount: 0, items: [], type: "",
  maker: "", customer: "", memberKind: "", pay: "", pro: "", memo: "", source: "app", ...p,
});

test("allocate: 合計がちょうど取引額になる（端数は最後）", () => {
  assert.deepEqual(allocate(1000, [{ name: "a", qty: 1, amount: 1 }, { name: "b", qty: 1, amount: 2 }]), [333, 667]);
  assert.deepEqual(allocate(900, [{ name: "a", qty: 2, amount: 0 }, { name: "b", qty: 1, amount: 0 }]), [600, 300]);
  assert.deepEqual(allocate(-500, [{ name: "a", qty: 1, amount: 0 }]), [-500]);
});

test("ledgerCategory: 月会費→月会費(窓口)（refresh_mon_sales_from_lines と同じ）", () => {
  assert.equal(ledgerCategory("月会費"), "月会費(窓口)");
  assert.equal(ledgerCategory("販売"), "販売");
  assert.equal(ledgerCategory(null), "その他");
});

test("nameFromMemo: 既定メモは空、会員番号の括弧は外す", () => {
  assert.equal(nameFromMemo("Square店頭決済"), "");
  assert.equal(nameFromMemo("Web入会 前取り2か月分（FR0070）"), "Web入会 前取り2か月分");
  assert.equal(nameFromMemo("Square: レッスンチケット1枚"), "レッスンチケット1枚");
});

test("buildDrill: 品目の合計＝カテゴリの合計、品名なしは最後", () => {
  const facts = [
    f({ amount: 1000, items: [{ name: "打席利用 1時間", qty: 1, amount: 1100 }], customer: "A", pay: "カード" }),
    f({ amount: 3000, items: [{ name: "打席利用　1時間", qty: 2, amount: 2200 }, { name: "ウーロン茶", qty: 1, amount: 1100 }], customer: "B", pay: "現金", date: "2026-09-11" }),
    f({ amount: 5000, items: [], customer: "A", pay: "カード" }),
  ];
  const d = buildDrill(facts, "2026-09");
  assert.equal(d.total, 9000);
  assert.equal(d.items.reduce((s, r) => s + r.amount, 0), 9000);
  assert.equal(d.items[d.items.length - 1].name, NO_NAME);
  const bay = d.items.find((r) => r.key === itemKey("打席利用 1時間"))!;
  assert.equal(bay.amount, 1000 + 2000); // 全角スペースの表記ゆれは同じ品目
  assert.equal(bay.qty, 3);
  assert.equal(d.customers, 2);
  assert.equal(d.unnamed, 1);
  assert.equal(d.daily.length, 30);
  assert.equal(d.daily[10].amount, 3000);
  assert.equal(factsWithItem(facts, itemKey("ウーロン茶")).length, 1);
});

test("squareLineItems: 名前・数量・金額。Regularは付けない、名前なしは金額入力", () => {
  const items = squareLineItems([
    { name: "打席利用", variation_name: "1時間", quantity: "2", total_money: { amount: 4400 } },
    { name: "ウーロン茶", variation_name: "Regular", quantity: "1", base_price_money: { amount: 300 } },
    { quantity: "1", total_money: { amount: 5000 } },
  ]);
  assert.deepEqual(items, [
    { name: "打席利用 1時間", qty: 2, amount: 4400 },
    { name: "ウーロン茶", qty: 1, amount: 300 },
    { name: "金額入力（品名なし）", qty: 1, amount: 5000 },
  ]);
  assert.equal(itemsMemo(items), "打席利用 1時間 x2・ウーロン茶 x1・金額入力（品名なし） x1");
  assert.equal(itemsMemo([]), null);
});
