// 給与計算ロジックのテスト（Shift Cloud）。実行: npm test（node --test、Node 22.18+の型ストリップ）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoBreakMinutes,
  monthRange,
  roundDailyWork,
  aggregateAttendance,
  calcPayrollAmounts,
} from "../apps/shift-cloud/src/lib/payroll-calc.ts";

test("autoBreakMinutes: 労基法の段階式（6h超=45分, 8h超=60分）", () => {
  assert.equal(autoBreakMinutes(0), 0);
  assert.equal(autoBreakMinutes(6 * 60), 0); // ちょうど6時間は付与なし
  assert.equal(autoBreakMinutes(6 * 60 + 1), 45);
  assert.equal(autoBreakMinutes(8 * 60), 45); // ちょうど8時間は45分
  assert.equal(autoBreakMinutes(8 * 60 + 1), 60);
  assert.equal(autoBreakMinutes(9 * 60), 60);
});

test("monthRange: 実在する月末日を返す（AUDIT D-1: 旧-31固定バグの回帰防止）", () => {
  assert.deepEqual(monthRange("2026-06"), { from: "2026-06-01", to: "2026-06-30" });
  assert.deepEqual(monthRange("2026-07"), { from: "2026-07-01", to: "2026-07-31" });
  assert.deepEqual(monthRange("2026-02"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(monthRange("2028-02"), { from: "2028-02-01", to: "2028-02-29" }); // 閏年
  assert.deepEqual(monthRange("2026-09"), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(monthRange("2026-12"), { from: "2026-12-01", to: "2026-12-31" });
  assert.throws(() => monthRange("2026-13"));
  assert.throws(() => monthRange("garbage"));
});

test("roundDailyWork: floor丸め・0は丸めなし（DECISIONS #9）", () => {
  assert.equal(roundDailyWork(487, 0), 487);
  assert.equal(roundDailyWork(487, 15), 480);
  assert.equal(roundDailyWork(480, 15), 480);
  assert.equal(roundDailyWork(14, 15), 0);
});

test("aggregateAttendance: 日次丸め後に合算・出勤日数はwork>0のみ", () => {
  const days = [
    { staff_id: "a", work_minutes: 487, overtime_minutes: 30 },
    { staff_id: "a", work_minutes: 300, overtime_minutes: 0 },
    { staff_id: "a", work_minutes: 0, overtime_minutes: 0 }, // 打刻漏れ日: 日数に数えない
    { staff_id: "b", work_minutes: 600, overtime_minutes: 60 },
  ];
  const m = aggregateAttendance(days, 15);
  assert.deepEqual(m.get("a"), { work: 480 + 300, overtime: 30, daysWorked: 2 });
  assert.deepEqual(m.get("b"), { work: 600, overtime: 60, daysWorked: 1 });
});

test("calcPayrollAmounts: 基本・残業1.25倍・交通費/日、floor円（DECISIONS #4）", () => {
  // 実働160h（うち残業10h）、時給1,200円、交通費500円/日×20日
  const agg = { work: 160 * 60, overtime: 10 * 60, daysWorked: 20 };
  const a = calcPayrollAmounts(agg, 1200, 500, 1.25);
  assert.equal(a.base_amount, 150 * 1200); // 180,000
  assert.equal(a.overtime_amount, 10 * 1200 * 1.25); // 15,000
  assert.equal(a.commute_amount, 500 * 20); // 10,000
  assert.equal(a.total_amount, 180000 + 15000 + 10000);
});

test("calcPayrollAmounts: 分単位の端数はfloor（切り捨て）", () => {
  // 90分＝1.5h × 時給1,111円 = 1,666.5 → 1,666円
  const a = calcPayrollAmounts({ work: 90, overtime: 0, daysWorked: 1 }, 1111, 0, 1.25);
  assert.equal(a.base_amount, 1666);
});

test("calcPayrollAmounts: 丸めで実働<残業になっても通常分は負にならない（AUDIT D-2）", () => {
  // 日次丸めの累積で work(丸め後) < overtime になった極端ケース
  const a = calcPayrollAmounts({ work: 50, overtime: 60, daysWorked: 1 }, 1200, 0, 1.25);
  assert.equal(a.base_amount, 0); // 負値ガード
  assert.equal(a.overtime_amount, Math.floor(1 * 1200 * 1.25));
  assert.ok(a.total_amount >= 0);
});
