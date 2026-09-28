// Money OS 売上の集計表（#285）— 「パーソナルが担当ごとに何件・いくらか」
import { test } from "node:test";
import assert from "node:assert/strict";
import { explode, filterRows, buildPivot, cellKey, pivotItemKey, pivotCsv, unitPrice } from "../apps/money-golfwing/src/lib/pivot.ts";
import type { SaleFact } from "../apps/money-golfwing/src/lib/sales-drill.ts";

const f = (o: Partial<SaleFact> & { items: SaleFact["items"]; amount: number }): SaleFact => ({
  id: Math.random().toString(36),
  date: "2026-09-10",
  category: "利用料",
  type: "",
  maker: "",
  customer: "",
  memberKind: "",
  pay: "現金",
  pro: "",
  memo: "",
  source: "app",
  ...o,
});

const FACTS: SaleFact[] = [
  // 台帳の書き方と画面入力の書き方（揺れ）
  f({ pro: "安東", amount: 4000, items: [{ name: "パーソナルレッスン（25分）", qty: 1, amount: 4000 }] }),
  f({ pro: "安東", amount: 8000, items: [{ name: "パーソナルレッスン２５分", qty: 2, amount: 8000 }] }),
  f({ pro: "古川", amount: 2000, date: "2026-08-03", items: [{ name: "パーソナルレッスン25分", qty: 1, amount: 2000 }] }),
  f({ pro: "", amount: 3000, items: [{ name: "パーソナルレッスン 25分", qty: 1, amount: 3000 }] }),
  // パーソナル以外
  f({ pro: "安東", amount: 1500, items: [{ name: "打席利用60分", qty: 1, amount: 1500 }] }),
  // 1会計に2品目（按分される）
  f({ category: "販売", amount: 3000, items: [{ name: "グリップ", qty: 2, amount: 2000 }, { name: "ボール", qty: 1, amount: 1000 }] }),
];

test("表記ゆれのある同じ商品は1つにまとまる", () => {
  assert.equal(pivotItemKey("パーソナルレッスン（25分）"), pivotItemKey("パーソナルレッスン２５分"));
  assert.equal(pivotItemKey("パーソナルレッスン 25分"), pivotItemKey("パーソナルレッスン25分"));
  const p = buildPivot(explode(FACTS), "item", null);
  const personal = p.rows.filter((r) => r.key === pivotItemKey("パーソナルレッスン25分"));
  assert.equal(personal.length, 1);
  assert.equal(personal[0].total.count, 4);
  assert.equal(personal[0].total.qty, 5);
  assert.equal(personal[0].total.amount, 17000);
});

test("パーソナルを担当ごとに: 件数・回数・金額（担当なしは最後）", () => {
  const rows = filterRows(explode(FACTS), { q: "パーソナル" });
  const p = buildPivot(rows, "pro", null);
  assert.deepEqual(
    p.rows.map((r) => [r.label, r.total.count, r.total.qty, r.total.amount]),
    [["安東", 2, 3, 12000], ["古川", 1, 1, 2000], ["（担当なし）", 1, 1, 3000]],
  );
  assert.equal(p.grand.amount, 17000);
  assert.equal(unitPrice(p.rows[0].total), 4000);
});

test("担当×月: 月は古い順、セルと合計が合う", () => {
  const p = buildPivot(filterRows(explode(FACTS), { q: "パーソナル" }), "pro", "month");
  assert.deepEqual(p.cols.map((c) => c.label), ["2026年8月", "2026年9月"]);
  assert.equal(p.cells.get(cellKey("古川", "2026-08"))?.amount, 2000);
  assert.equal(p.cells.get(cellKey("安東", "2026-09"))?.qty, 3);
  const sumCols = p.cols.reduce((a, c) => a + c.total.amount, 0);
  assert.equal(sumCols, p.grand.amount);
});

test("1会計に複数品目があれば金額を按分し、合計は崩れない", () => {
  const rows = explode(FACTS.filter((x) => x.category === "販売"));
  assert.equal(rows.length, 2);
  assert.equal(rows.reduce((a, r) => a + r.amount, 0), 3000);
});

test("CSVはBOM付きでExcelで開ける形、合計行がある", () => {
  const csv = pivotCsv(buildPivot(filterRows(explode(FACTS), { q: "パーソナル" }), "pro", null));
  assert.ok(csv.startsWith("﻿担当,"));
  assert.match(csv, /\r\n安東,2,3,12000,4000\r\n/);
  assert.match(csv, /合計,4,5,17000/);
});
