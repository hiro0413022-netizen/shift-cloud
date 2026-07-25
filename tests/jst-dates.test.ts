import test from "node:test";
import assert from "node:assert/strict";
import { jstDateJa, jstYmd, jstMonthStart } from "../apps/genesis/src/lib/jst.ts";

/* ============================================================
   JST日付ヘルパー（2026-07-19 発見のバグの固定）

   背景: 日次cronは 6:00 JST＝前日21:00 UTC に走る。
   new Date().toLocaleDateString("ja-JP")（UTC解釈）を使っていたため、
   7/19 6:00生成の日次レポートが「日次レポート 2026/7/18」と前日表記になり、
   sp_tasksの日付・提案のdedupeキーも同様に前日ズレしていた。
   毎月1日の朝は「当月」判定も1か月ズレる（kpi-checks）。
   ============================================================ */

// 日次cronの実時刻を再現: 2026-07-18 21:00 UTC = 2026-07-19 06:00 JST
const cronMoment = new Date("2026-07-18T21:00:49Z");

test("jstDateJa: 6:00 JSTのcronでJSTの今日を返す（前日にならない）", () => {
  assert.equal(jstDateJa(cronMoment), "2026/7/19");
});

test("jstYmd: DB date列・dedupeキー用にJSTのYYYY-MM-DDを返す", () => {
  assert.equal(jstYmd(cronMoment), "2026-07-19");
  // JST深夜0:30（= 前日15:30 UTC）でもJSTの日付
  assert.equal(jstYmd(new Date("2026-07-18T15:30:00Z")), "2026-07-19");
  // 日中はUTCと同日
  assert.equal(jstYmd(new Date("2026-07-19T03:00:00Z")), "2026-07-19");
});

test("jstMonthStart: 毎月1日 6:00 JST（前月末日UTC）でも当月初を返す", () => {
  // 2026-08-01 06:00 JST = 2026-07-31 21:00 UTC
  const firstMorning = new Date("2026-07-31T21:00:00Z");
  assert.equal(jstMonthStart(0, firstMorning), "2026-08-01");
  assert.equal(jstMonthStart(-1, firstMorning), "2026-07-01");
  // 年またぎ: 2027-01-01 06:00 JST
  const newYear = new Date("2026-12-31T21:00:00Z");
  assert.equal(jstMonthStart(0, newYear), "2027-01-01");
  assert.equal(jstMonthStart(-1, newYear), "2026-12-01");
});
