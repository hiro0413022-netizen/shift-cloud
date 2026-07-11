// 給与計算ロジックのテスト（Shift Cloud）。実行: npm test（node --test、Node 22.18+の型ストリップ）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoBreakMinutes,
  monthRange,
  roundDailyWork,
  aggregateAttendance,
  calcPayrollAmounts,
  wageOnDate,
  calcMonthlyPayroll,
  type WageRow,
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

/* ===== 時給の月中変更（日付按分 / AUDIT D-3・DECISIONS #39） ===== */

const WAGES: WageRow[] = [
  { staff_id: "a", hourly_wage: 1000, commute_allowance: 400, effective_from: "2026-06-01" },
  { staff_id: "a", hourly_wage: 1200, commute_allowance: 500, effective_from: "2026-06-16" },
  { staff_id: "b", hourly_wage: 1500, commute_allowance: 0, effective_from: "2026-01-01" },
];

test("wageOnDate: その日に有効な賃金（月中の変更日を境に切替）", () => {
  assert.equal(wageOnDate(WAGES, "a", "2026-06-15")?.hourly_wage, 1000);
  assert.equal(wageOnDate(WAGES, "a", "2026-06-16")?.hourly_wage, 1200);
  assert.equal(wageOnDate(WAGES, "a", "2026-07-01")?.hourly_wage, 1200);
  assert.equal(wageOnDate(WAGES, "b", "2026-06-10")?.hourly_wage, 1500);
});

test("wageOnDate: 賃金開始日より前の勤務日は最古の賃金へフォールバック（0円事故防止）", () => {
  // 旧実装は月末時点の賃金を全日に適用していた。登録が遅れたケースで0円にしない
  assert.equal(wageOnDate(WAGES, "a", "2026-05-01")?.hourly_wage, 1000);
  assert.equal(wageOnDate(WAGES, "zzz", "2026-06-01"), null); // 賃金未登録スタッフ
});

test("calcMonthlyPayroll: 月中の時給変更を日付で按分（変更前後で別レート計算）", () => {
  const days = [
    { staff_id: "a", date: "2026-06-10", work_minutes: 480, overtime_minutes: 0 }, // 1000円期
    { staff_id: "a", date: "2026-06-15", work_minutes: 480, overtime_minutes: 60 }, // 1000円期
    { staff_id: "a", date: "2026-06-16", work_minutes: 480, overtime_minutes: 0 }, // 1200円期
    { staff_id: "a", date: "2026-06-20", work_minutes: 300, overtime_minutes: 0 }, // 1200円期
  ];
  const r = calcMonthlyPayroll(days, WAGES, 0, 1.25).get("a")!;
  // 1000円期: 実働960(残業60) → 通常900分=15h×1000=15,000 / 残業1h×1000×1.25=1,250 / 交通費400×2
  // 1200円期: 実働780 → 13h×1200=15,600 / 交通費500×2
  assert.equal(r.periods.length, 2);
  assert.deepEqual(
    r.periods.map((p) => [p.hourly_wage, p.from_date, p.to_date, p.base_amount, p.overtime_amount, p.commute_amount]),
    [
      [1000, "2026-06-10", "2026-06-15", 15000, 1250, 800],
      [1200, "2026-06-16", "2026-06-20", 15600, 0, 1000],
    ]
  );
  assert.equal(r.base_amount, 15000 + 15600);
  assert.equal(r.overtime_amount, 1250);
  assert.equal(r.commute_amount, 800 + 1000);
  assert.equal(r.total_amount, 15000 + 15600 + 1250 + 1800);
  assert.equal(r.work, 960 + 780);
  assert.equal(r.daysWorked, 4);
});

test("calcMonthlyPayroll: 単一時給のスタッフは従来計算（calcPayrollAmounts）と完全一致", () => {
  const days = [
    { staff_id: "b", date: "2026-06-01", work_minutes: 487, overtime_minutes: 30 },
    { staff_id: "b", date: "2026-06-02", work_minutes: 300, overtime_minutes: 0 },
  ];
  const r = calcMonthlyPayroll(days, WAGES, 15, 1.25).get("b")!;
  const legacy = calcPayrollAmounts(
    { work: 480 + 300, overtime: 30, daysWorked: 2 },
    1500,
    0,
    1.25
  );
  assert.equal(r.base_amount, legacy.base_amount);
  assert.equal(r.overtime_amount, legacy.overtime_amount);
  assert.equal(r.commute_amount, legacy.commute_amount);
  assert.equal(r.total_amount, legacy.total_amount);
  assert.equal(r.periods.length, 1);
});

test("calcMonthlyPayroll: 賃金未登録スタッフは0円（実働は記録される）", () => {
  const days = [{ staff_id: "zzz", date: "2026-06-01", work_minutes: 480, overtime_minutes: 0 }];
  const r = calcMonthlyPayroll(days, WAGES, 0, 1.25).get("zzz")!;
  assert.equal(r.total_amount, 0);
  assert.equal(r.work, 480);
});
