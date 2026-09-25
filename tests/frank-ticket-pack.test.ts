// FRANK レッスンチケットのまとめ買い（2026-09-19 ユーザー指摘: 4枚は税込9,900円）
import { test } from "node:test";
import assert from "node:assert/strict";
import { ticketAmountExTax } from "../packages/core/src/frank-lesson-tickets.ts";
import { withTax } from "../packages/core/src/frank-tax.ts";

const packs = [{ qty: 4, price: 9000 }];
test("4枚は税込9,900円・1枚は2,750円", () => {
  assert.equal(withTax(ticketAmountExTax(4, 2500, packs)), 9900);
  assert.equal(withTax(ticketAmountExTax(1, 2500, packs)), 2750);
});
test("端数は1枚単価・8枚は4枚×2", () => {
  assert.equal(ticketAmountExTax(5, 2500, packs), 11500);
  assert.equal(ticketAmountExTax(8, 2500, packs), 18000);
  assert.equal(withTax(ticketAmountExTax(8, 2500, packs)), 19800);
});
test("まとめ買いが単価より高い設定は使わない", () => {
  assert.equal(ticketAmountExTax(4, 2500, [{ qty: 4, price: 12000 }]), 10000);
});

/* ============================================================
   8枚セット 17,600円（税込）を追加（2026-09-25 ユーザー指定・#279）
   ============================================================ */
const packs8 = [
  { qty: 4, price: 9000 },
  { qty: 8, price: 16000 },
];

test("8枚セットは税込17,600円", () => {
  assert.equal(ticketAmountExTax(8, 2500, packs8), 16000);
  assert.equal(withTax(ticketAmountExTax(8, 2500, packs8)), 17600);
});

test("4枚セットは据え置き・1枚単価も変わらない", () => {
  assert.equal(withTax(ticketAmountExTax(4, 2500, packs8)), 9900);
  assert.equal(withTax(ticketAmountExTax(1, 2500, packs8)), 2750);
});

test("多く買うほうが安い、が起きない（7枚が8枚より高くならない）", () => {
  // 素直に大きい束から当てるだけだと 7枚＝9,000+2,500×3＝16,500 で 8枚(16,000)より高くなる
  for (let q = 1; q < 12; q++) {
    const here = ticketAmountExTax(q, 2500, packs8);
    const next = ticketAmountExTax(q + 1, 2500, packs8);
    assert.ok(here <= next, `${q}枚(${here}) が ${q + 1}枚(${next}) より高い`);
  }
  assert.equal(ticketAmountExTax(7, 2500, packs8), 16000);
});

test("9枚以上は8枚セット＋端数", () => {
  assert.equal(ticketAmountExTax(9, 2500, packs8), 18500); // 16,000 + 2,500
  assert.equal(ticketAmountExTax(12, 2500, packs8), 25000); // 16,000 + 9,000
});

test("束が1つでも、まとめ買いの下限より少ない枚数はこれまでどおり", () => {
  assert.equal(ticketAmountExTax(2, 2500, packs8), 5000);
  assert.equal(ticketAmountExTax(3, 2500, packs8), 7500);
});
