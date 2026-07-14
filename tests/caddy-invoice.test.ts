import test from "node:test";
import assert from "node:assert/strict";
// ※ import は .ts 拡張子付きが必須（node --test の型ストリップの制約）
import { buildInvoice, closingDateOf, jpDate, invoiceNo } from "../apps/caddy-os/src/lib/invoice.ts";

/* ============================================================
   請求書ロジック（DECISIONS #46）

   実物の請求書PDF「2026_6加古川ゴルフ俱楽部.pdf」を再現して固定する。
   実物が正・コードが従う。金額が1円でもズレたら落ちる。
   ============================================================ */

test("実物再現: 2026年6月 加古川ゴルフ倶楽部 = 小計96,000 / 税9,600 / 合計105,600", () => {
  // 請求書の明細: 6/7×1, 6/13×1, 6/14×2, 6/24×1, 6/28×1（単価16,000）
  const rows = [
    { dispatch_date: "2026-06-07", sales_amount: 16000 },
    { dispatch_date: "2026-06-13", sales_amount: 16000 },
    { dispatch_date: "2026-06-14", sales_amount: 16000 },
    { dispatch_date: "2026-06-14", sales_amount: 16000 },
    { dispatch_date: "2026-06-24", sales_amount: 16000 },
    { dispatch_date: "2026-06-28", sales_amount: 16000 },
  ];
  const inv = buildInvoice(rows, "2026-06", "月末");

  assert.equal(inv.lines.length, 5); // 同じ日はまとめて1行（6/14は数量2）
  assert.equal(inv.lines[2].label, "キャディ業務料 (2026年 6月14日 分）");
  assert.equal(inv.lines[2].qty, 2);
  assert.equal(inv.lines[2].amount, 32000);

  assert.equal(inv.subtotal, 96000);
  assert.equal(inv.tax, 9600);
  assert.equal(inv.total, 105600);
  assert.equal(inv.closingDate, "2026-06-30");
});

test("売上0の派遣（研修・自社負担）は請求対象外", () => {
  const inv = buildInvoice(
    [
      { dispatch_date: "2026-06-01", sales_amount: 17000 },
      { dispatch_date: "2026-06-02", sales_amount: 0 },
    ],
    "2026-06",
    "月末"
  );
  assert.equal(inv.lines.length, 1);
  assert.equal(inv.subtotal, 17000);
});

test("同じ日でも単価が違えば別明細（スポット単価4,000など）", () => {
  const inv = buildInvoice(
    [
      { dispatch_date: "2026-01-03", sales_amount: 4000 },
      { dispatch_date: "2026-01-03", sales_amount: 4000 },
      { dispatch_date: "2026-01-03", sales_amount: 18000 },
    ],
    "2026-01",
    "月末"
  );
  assert.equal(inv.lines.length, 2);
  assert.equal(inv.lines[0].unit_price, 4000);
  assert.equal(inv.lines[0].qty, 2);
  assert.equal(inv.subtotal, 26000);
});

test("締切日: 西宮高原は「２０日締め」（全角）→ その月の20日", () => {
  assert.equal(closingDateOf("2026-06", "２０日締め"), "2026-06-20");
  assert.equal(closingDateOf("2026-02", "20日"), "2026-02-20");
});

test("締切日: 「月末」「空欄」は実在する月末日（2月は28日・うるう年は29日）", () => {
  assert.equal(closingDateOf("2026-06", "月末"), "2026-06-30");
  assert.equal(closingDateOf("2026-02", ""), "2026-02-28");
  assert.equal(closingDateOf("2024-02", null), "2024-02-29");
  assert.equal(closingDateOf("2026-01", "月末"), "2026-01-31");
});

test("消費税は小計に対して10%・端数はfloor（DECISIONS #4のinteger円）", () => {
  const inv = buildInvoice([{ dispatch_date: "2026-06-01", sales_amount: 17777 }], "2026-06", "月末");
  assert.equal(inv.subtotal, 17777);
  assert.equal(inv.tax, 1777); // 1777.7 → floor
  assert.equal(inv.total, 19554);
});

test("明細ラベルは実物と同じ表記（0埋めしない）", () => {
  assert.equal(jpDate("2026-06-07"), "2026年 6月7日");
});

test("請求番号は 対象月 + 取引先コード", () => {
  assert.equal(invoiceNo("2026-06", "G-0002", "加古川ゴルフ倶楽部"), "2026-06-G0002");
});
