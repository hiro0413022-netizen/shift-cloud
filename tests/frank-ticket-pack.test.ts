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
