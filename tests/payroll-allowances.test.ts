import test from "node:test";
import assert from "node:assert/strict";
import {
  calcMonthlyPayroll,
  sumAllowances,
  type WageRow,
  type AllowanceRow,
  // ※ import は .ts 拡張子付きが必須（node --test の型ストリップの制約）
} from "../apps/shift-cloud/src/lib/payroll-calc.ts";

/* ============================================================
   手当・月給の給与計算（DECISIONS #44 / migration 0035）

   このテストは「実際の給与明細（260724支給 = 2026年6月度）」を再現して固定する。
   金額が1円でもズレたら落ちる。明細PDFが正であり、コードが従う。

   確認済みの支給式:
     時給者 = 時給×実労働時間 + 交通費日額×出勤日数 + Σ手当
     月給者 = 月給（固定）    + 交通費実費           + Σ手当
   ============================================================ */

const D = (staff_id: string, date: string, work: number) => ({
  staff_id,
  date,
  work_minutes: work,
  overtime_minutes: 0,
});

/** 指定の合計実労働時間(分)を、指定日数に分けた勤怠を作る（端数は初日に寄せる） */
function daysFor(staffId: string, totalMinutes: number, dayCount: number) {
  const per = Math.floor(totalMinutes / dayCount);
  const rest = totalMinutes - per * dayCount;
  return Array.from({ length: dayCount }, (_, i) =>
    D(staffId, `2026-06-${String(i + 1).padStart(2, "0")}`, per + (i === 0 ? rest : 0))
  );
}

const hourly = (staff_id: string, wage: number, commute: number): WageRow => ({
  staff_id,
  hourly_wage: wage,
  commute_allowance: commute,
  effective_from: "2026-01-01",
  wage_type: "hourly",
});

const monthly = (staff_id: string, salary: number): WageRow => ({
  staff_id,
  hourly_wage: 0,
  commute_allowance: 0,
  effective_from: "2026-01-01",
  wage_type: "monthly",
  monthly_salary: salary,
});

const opts = (allowances: AllowanceRow[], includeStaffIds: string[] = []) => ({
  monthEnd: "2026-06-30",
  allowances,
  includeStaffIds,
});

test("井殿さん 2026年6月度: 時給2,500×94.75h + 交通費720×13日 + パーソナル1件2,000 = 248,235円", () => {
  // 給与明細260724支給: 基本給236,875 / 非課税交通費9,360 / 総支給248,235
  const days = daysFor("idono", 94.75 * 60, 13);
  const r = calcMonthlyPayroll(days, [hourly("idono", 2500, 720)], 0, 1.25, opts([
    { staff_id: "idono", kind: "personal", amount: 2000 },
  ])).get("idono")!;

  assert.equal(r.base_amount, 236875);
  assert.equal(r.commute_amount, 9360);
  assert.equal(r.allowance_amount, 2000);
  assert.equal(r.total_amount, 248235); // 給与明細と1円一致
});

test("福原さん 2026年6月度: 手当なし = 247,100円", () => {
  const days = daysFor("fukuhara", 96.5 * 60, 13);
  const r = calcMonthlyPayroll(days, [hourly("fukuhara", 2500, 450)], 0, 1.25, opts([])).get("fukuhara")!;

  assert.equal(r.base_amount, 241250);
  assert.equal(r.commute_amount, 5850);
  assert.equal(r.allowance_amount, 0);
  assert.equal(r.total_amount, 247100);
});

test("榎本さん 2026年6月度: 4日勤務＋パーソナル1件 = 69,785円", () => {
  const days = daysFor("enomoto", 26.25 * 60, 4);
  const r = calcMonthlyPayroll(days, [hourly("enomoto", 2500, 540)], 0, 1.25, opts([
    { staff_id: "enomoto", kind: "personal", amount: 2000 },
  ])).get("enomoto")!;

  assert.equal(r.base_amount, 65625);
  assert.equal(r.commute_amount, 2160);
  assert.equal(r.total_amount, 69785);
});

test("林さん 2026年6月度: 月給270,000＋交通費実費4,680 = 274,680円（実労働時間は金額に影響しない）", () => {
  // 給与明細260724支給: 基本給270,000 / 非課税交通費4,680 / 総支給274,680
  const days = daysFor("hayashi", 160 * 60, 20); // 何時間働いても月給は固定
  const r = calcMonthlyPayroll(days, [monthly("hayashi", 270000)], 0, 1.25, opts([
    { staff_id: "hayashi", kind: "commute_actual", amount: 4680 },
  ])).get("hayashi")!;

  assert.equal(r.wage_type, "monthly");
  assert.equal(r.base_amount, 270000);
  assert.equal(r.commute_amount, 4680); // 日額×日数ではなく実費
  assert.equal(r.total_amount, 274680);
  assert.equal(r.daysWorked, 20); // 勤怠は記録されるが金額には効かない
});

test("役員（勤怠0日）でも月給は満額支給される: 古川さん 80,000円", () => {
  // includeStaffIds に入れないと、勤怠0日のスタッフは結果に現れず給与が消える
  const r = calcMonthlyPayroll([], [monthly("furukawa", 80000)], 0, 1.25, opts([], ["furukawa"])).get(
    "furukawa"
  )!;

  assert.equal(r.base_amount, 80000);
  assert.equal(r.daysWorked, 0);
  assert.equal(r.total_amount, 80000);
});

test("安東さん型: パーソナル25件＋ラウンドレッスン1件の手当が合算される", () => {
  // 給与一覧2026.6: 時給2,750 / 112.25h / パーソナル2,000×25件 / RL 33,000
  const days = daysFor("ando", 112.25 * 60, 17);
  const r = calcMonthlyPayroll(days, [hourly("ando", 2750, 0)], 0, 1.25, opts([
    { staff_id: "ando", kind: "personal", amount: 50000 },
    { staff_id: "ando", kind: "round_lesson", amount: 33000 },
  ])).get("ando")!;

  assert.equal(r.base_amount, 308687); // 2750 × 112.25h（端数floor）
  assert.equal(r.allowance_amount, 83000);
  assert.equal(r.total_amount, 391687);
});

test("sumAllowances: commute_actual だけは交通費側に分離される", () => {
  const rows: AllowanceRow[] = [
    { staff_id: "a", kind: "personal", amount: 2000 },
    { staff_id: "a", kind: "compe", amount: 20000 },
    { staff_id: "a", kind: "commute_actual", amount: 4680 },
    { staff_id: "b", kind: "personal", amount: 9999 }, // 別スタッフは混ざらない
  ];
  assert.deepEqual(sumAllowances(rows, "a"), { allowance: 22000, commuteActual: 4680 });
});

test("後方互換: opts無しの呼び出しは従来と同じ（手当0・時給計算）", () => {
  const days = daysFor("x", 60 * 10, 2);
  const r = calcMonthlyPayroll(days, [hourly("x", 1000, 500)], 0, 1.25).get("x")!;
  assert.equal(r.base_amount, 10000);
  assert.equal(r.commute_amount, 1000);
  assert.equal(r.allowance_amount, 0);
  assert.equal(r.total_amount, 11000);
});
