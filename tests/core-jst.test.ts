// @yozan/core/jst（MODULARIZATION_PLAN ③）のテスト。
// 本体の挙動は tests/jst-dates.test.ts（genesisコピー側）で固定済み。
// ここでは「coreへの集約版がgenesis/inventory-osのコピーと同一挙動」であることだけを固定し、
// 3コピーの静かなドリフト（片方だけ直して日付がズレる事故）を検知する。
import test from "node:test";
import assert from "node:assert/strict";
import * as core from "../packages/core/src/jst.ts";
import * as genesis from "../apps/genesis/src/lib/jst.ts";
import * as inventory from "../apps/inventory-os/src/lib/jst.ts";

// 日次cronの実時刻（UTC前日21時＝JST朝6時）と、月初・年末年始の境界
const CASES = [
  new Date("2026-07-18T21:00:00Z"),
  new Date("2026-07-31T20:59:00Z"),
  new Date("2026-12-31T15:00:00Z"),
  new Date("2026-01-01T00:00:00Z"),
];

test("core版はgenesis/inventory-osのコピーと同一挙動（ドリフト検知）", () => {
  for (const d of CASES) {
    for (const impl of [genesis, inventory]) {
      assert.equal(core.jstDateJa(d), impl.jstDateJa(d));
      assert.equal(core.jstYmd(d), impl.jstYmd(d));
      assert.equal(core.jstMonthStart(0, d), impl.jstMonthStart(0, d));
      assert.equal(core.jstMonthStart(-1, d), impl.jstMonthStart(-1, d));
    }
  }
});
