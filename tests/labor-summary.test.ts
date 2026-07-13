// 本部ダッシュボード(/hq)の労働時間・人件費が「給与計算と1円/1分単位で一致する」ことを固定する。
// 回帰防止の対象（DECISIONS #53 で実際に起きたバグ）:
//   (a) 15分丸めの掛け忘れ  (b) 月給者を時給0円扱い  (c) 交通費・手当・残業割増の未反映
//   (d) 休憩の二重控除（work_minutes は控除後なので、ここで引いてはいけない）
// フィクスチャは 2026年7月の実データ（GOLF WING 宝塚）。
import test from "node:test";
import assert from "node:assert/strict";
import { summarizeLabor, type LaborDay } from "../apps/shift-cloud/src/lib/labor-summary.ts";
import { calcMonthlyPayroll, type WageRow } from "../apps/shift-cloud/src/lib/payroll-calc.ts";

const GW = "store-golfwing";
const FR = "store-frunk";

// 2026-07 実データの再現（work_minutes は休憩控除後の値）
const WAGES: WageRow[] = [
  { staff_id: "idono", hourly_wage: 2500, commute_allowance: 720, effective_from: "2026-01-01", wage_type: "hourly" },
  { staff_id: "urabe", hourly_wage: 2500, commute_allowance: 0, effective_from: "2026-01-01", wage_type: "hourly" },
  { staff_id: "ando", hourly_wage: 2750, commute_allowance: 0, effective_from: "2026-01-01", wage_type: "hourly" },
  { staff_id: "fukuhara", hourly_wage: 2500, commute_allowance: 450, effective_from: "2026-01-01", wage_type: "hourly" },
  { staff_id: "tanigawa", hourly_wage: 1500, commute_allowance: 500, effective_from: "2026-01-01", wage_type: "hourly" },
  // 月給者（役員）: 勤怠0日でも満額支給される（DECISIONS #44）
  { staff_id: "furukawa", hourly_wage: 0, commute_allowance: 0, effective_from: "2026-07-02", wage_type: "monthly", monthly_salary: 80000 },
  // 月給者だが **勤怠レコードが1行も無い**（林さん等）。ここを落とすと人件費が丸ごと欠ける
  { staff_id: "hayashi", hourly_wage: 0, commute_allowance: 0, effective_from: "2026-01-01", wage_type: "monthly", monthly_salary: 270000 },
];

const d = (staff_id: string, date: string, work_minutes: number, overtime_minutes = 0, store_id = GW): LaborDay =>
  ({ staff_id, store_id, date, work_minutes, overtime_minutes });

// 2026-07 の attendance_days 実データ（work_minutes は休憩控除後）
const DAYS: LaborDay[] = [
  // 井殿: 480分（丸め後480）
  d("idono", "2026-07-06", 480),
  // 卜部: 488/337/486/487/489 = 生2287分 → 日次15分floor後 2250分
  d("urabe", "2026-07-04", 488), d("urabe", "2026-07-05", 337), d("urabe", "2026-07-09", 486),
  d("urabe", "2026-07-11", 487), d("urabe", "2026-07-12", 489),
  // 安東: 65/202/482/485/96/488/492 = 生2310分 → 丸め後2265分・残業10分
  d("ando", "2026-07-04", 65), d("ando", "2026-07-05", 202), d("ando", "2026-07-06", 482),
  d("ando", "2026-07-08", 485), d("ando", "2026-07-09", 96), d("ando", "2026-07-10", 488),
  d("ando", "2026-07-13", 492, 10),
  // 福原: 484分（丸め後480）
  d("fukuhara", "2026-07-05", 484),
  // 谷川: 284/311 = 生595分 → 丸め後570分
  d("tanigawa", "2026-07-09", 284), d("tanigawa", "2026-07-10", 311),
  // 古川（月給・役員）: シフトはあるが実働0
  d("furukawa", "2026-07-04", 0),
];

const ROUNDING = 15; // companies.settings.rounding_minutes
const OT_RATE = 1; // companies.settings.overtime_rate
const MONTH_END = "2026-07-31";

const summary = () =>
  summarizeLabor({
    days: DAYS,
    wages: WAGES,
    roundingMinutes: ROUNDING,
    overtimeRate: OT_RATE,
    monthEnd: MONTH_END,
    primaryStoreOf: () => GW, // 全員 GOLF WING 宝塚が主店舗
  });

test("総労働時間は15分丸め後（生の合計ではない）", () => {
  const s = summary();
  // 生の合計 6156分(=102時間36分) ではなく、日次15分floor後の 6045分(=100時間45分)
  assert.equal(s.totalWork, 6045);
  assert.notEqual(s.totalWork, 6156);
});

test("人件費は月給・交通費込みで給与計算と一致する", () => {
  const s = summary();
  const each = (id: string) => s.byStaff.get(id)!.total_amount;

  assert.equal(each("idono"), 20000 + 720); // 8h×2500 + 交通費720×1日
  assert.equal(each("urabe"), 93750); // 37.5h×2500
  assert.equal(each("ando"), 103812); // 通常2255分 + 残業10分（割増1.0）
  assert.equal(each("fukuhara"), 20000 + 450);
  assert.equal(each("tanigawa"), 14250 + 1000); // 9.5h×1500 + 500×2日
  assert.equal(each("furukawa"), 80000); // 月給（実働0でも満額）
  assert.equal(each("hayashi"), 270000); // 月給（勤怠レコード自体が無い）

  // 時給者253,982 + 月給者350,000
  assert.equal(s.totalCost, 603982);
  // 旧実装の値（丸めなし・月給0円）に戻っていないこと
  assert.notEqual(s.totalCost, 256203);
});

test("月給者は実働0でも人件費に含まれる（時給0円で消えない）", () => {
  const s = summary();
  const furukawa = s.byStaff.get("furukawa")!; // 勤怠あり・実働0
  assert.equal(furukawa.wage_type, "monthly");
  assert.equal(furukawa.work, 0);
  assert.equal(furukawa.total_amount, 80000);

  // 勤怠レコードが1行も無い月給者も必ず含める（includeStaffIds の付け忘れ検知）
  const hayashi = s.byStaff.get("hayashi")!;
  assert.equal(hayashi.total_amount, 270000);
});

test("summarizeLabor の合計は calcMonthlyPayroll と完全一致（二重実装の検知）", () => {
  const s = summary();
  const payroll = calcMonthlyPayroll(
    DAYS.map((x) => ({ staff_id: x.staff_id, date: x.date, work_minutes: x.work_minutes, overtime_minutes: x.overtime_minutes })),
    WAGES,
    ROUNDING,
    OT_RATE,
    { monthEnd: MONTH_END, includeStaffIds: ["furukawa", "hayashi"] }
  );
  const payrollTotal = [...payroll.values()].reduce((acc, r) => acc + r.total_amount, 0);
  const payrollWork = [...payroll.values()].reduce((acc, r) => acc + r.work, 0);
  assert.equal(s.totalCost, payrollTotal);
  assert.equal(s.totalWork, payrollWork);
});

test("店舗別按分の合計は総額と一致する（端数が消えない/増えない）", () => {
  const days: LaborDay[] = [
    // 卜部が2店舗にまたがる月
    d("urabe", "2026-07-04", 488, 0, GW),
    d("urabe", "2026-07-05", 458, 0, FR),
    d("furukawa", "2026-07-04", 0, 0, GW),
  ];
  const s = summarizeLabor({
    days,
    wages: WAGES,
    roundingMinutes: ROUNDING,
    overtimeRate: OT_RATE,
    monthEnd: MONTH_END,
    primaryStoreOf: () => GW,
  });
  const storeSum = [...s.byStore.values()].reduce((acc, v) => acc + v.cost, 0);
  assert.equal(storeSum, s.totalCost);
  // 実働0の月給者は主店舗（GW）へ全額計上される
  assert.equal(s.byStore.get(GW)!.cost >= 80000, true);
  assert.equal(s.byStore.get(FR)!.work, 450); // 458分 → 15分floor
});

test("休憩を二重控除していない（work_minutes は控除後の値をそのまま使う）", () => {
  // 拘束540分・休憩60分 → work_minutes=480 で渡す。ここからさらに休憩を引いてはいけない
  const s = summarizeLabor({
    days: [d("idono", "2026-07-03", 480)],
    wages: WAGES,
    roundingMinutes: ROUNDING,
    overtimeRate: OT_RATE,
    monthEnd: MONTH_END,
    primaryStoreOf: () => GW,
  });
  assert.equal(s.totalWork, 480);
  assert.equal(s.byStaff.get("idono")!.total_amount, 20000 + 720);
});
