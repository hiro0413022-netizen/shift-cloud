// craft-os の注文書: 状態の決め方と、紙の日付欄（「9／18」）の読み取り。
// 2026-09-18: 「注文書を印刷 → その場でお支払い → 発注」の運用で、お支払いだけで「完了」にならないこと。
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDay, workStatusOf } from "../apps/craft-os/src/lib/work-status.ts";

test("お支払いだけでは完了にしない（お渡し済み かつ お支払い済み で完了）", () => {
  assert.equal(workStatusOf({ paid_on: "2026-09-18" }), "open");
  assert.equal(workStatusOf({ paid_on: "2026-09-18", ordered_on: "2026-09-18" }), "ordered");
  assert.equal(workStatusOf({ delivered_on: "2026-09-30" }), "delivered");
  assert.equal(workStatusOf({ delivered_on: "2026-09-30", paid_on: "2026-09-18" }), "closed");
  assert.equal(workStatusOf({ arrived_on: "2026-09-20", ordered_on: "2026-09-18" }), "arrived");
});

test("紙の日付欄の読み取り", () => {
  const today = "2026-09-18";
  assert.equal(parseDay("9/18", today), "2026-09-18");
  assert.equal(parseDay("9／18", today), "2026-09-18");
  assert.equal(parseDay("１０/２", today), "2026-10-02");
  assert.equal(parseDay("0918", today), "2026-09-18");
  assert.equal(parseDay("2026-09-18", today), "2026-09-18");
  assert.equal(parseDay("2026/9/5", today), "2026-09-05");
  assert.equal(parseDay("今日", today), today);
  assert.equal(parseDay("", today), null);
  assert.equal(parseDay("／", today), null);
  assert.equal(parseDay("2/30", today), null);
  assert.equal(parseDay("abc", today), null);
});

test("年明けに前年12月を打っても来年にならない", () => {
  assert.equal(parseDay("12/28", "2027-01-05"), "2026-12-28");
  assert.equal(parseDay("1/10", "2027-01-05"), "2027-01-10");
});
