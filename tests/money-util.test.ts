// Money OS ユーティリティのテスト
import { test } from "node:test";
import assert from "node:assert/strict";
import { toNum, monthRange } from "../apps/money-golfwing/src/lib/money-util.ts";

test("toNum: カンマ・全角・空白を除去して数値化", () => {
  assert.equal(toNum("1,234"), 1234);
  assert.equal(toNum("１２３４５"), 12345);
  assert.equal(toNum("－１，０００"), -1000);
  assert.equal(toNum(" 5 000 "), 5000);
  assert.equal(toNum("abc"), 0);
  assert.equal(toNum(""), 0);
  assert.equal(toNum(null), 0);
});

test("monthRange: 月初〜翌月初（12月は年跨ぎ）", () => {
  assert.deepEqual(monthRange("2026-06"), { from: "2026-06-01", to: "2026-07-01" });
  assert.deepEqual(monthRange("2026-12"), { from: "2026-12-01", to: "2027-01-01" });
  assert.deepEqual(monthRange("2026-01"), { from: "2026-01-01", to: "2026-02-01" });
});
