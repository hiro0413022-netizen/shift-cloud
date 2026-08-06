import test from "node:test";
import assert from "node:assert/strict";
import {
  PERSONAL_LESSON_UNIT_PRICE,
  personalAllowanceAmount,
  splitLessonCounts,
  mergeByStaff,
  sumAmount,
  type LessonCountRow,
  // ※ import は .ts 拡張子付きが必須（node --test の型ストリップの制約）
} from "../apps/shift-cloud/src/lib/lesson-allowance.ts";

/* ============================================================
   パーソナルレッスン手当（DECISIONS #105 / migration 0094）

   算出元は money-os の売上台帳。DB関数 personal_lesson_counts が
   「担当プロ別の件数」を返し、このモジュールが支払区分ごとに仕分ける。

   2026年6月度は手入力の手当が既にあり（安東25 / 井殿1 / 卜部1 / 榎本1）、
   自動集計がそれと一致することを固定する＝移行しても金額が変わらない証明。
   ※古川さんは6月に1件担当しているが月給者のため手当は付かない（payout_mode='none'）。
   ※安東さんは2026-06から業務委託のため給与ではなく外注費（payout_mode='outsourcing'）。
   ============================================================ */

const R = (
  pro_name: string,
  staff_id: string | null,
  staff_name: string | null,
  payout_mode: LessonCountRow["payout_mode"],
  qty: number
): LessonCountRow => ({
  pro_name,
  staff_id,
  staff_name,
  payout_mode,
  qty,
  sales_amount: qty * 2000,
});

/** 2026-06 の実データ（personal_lesson_counts の戻り値と同じ形） */
const JUNE_2026: LessonCountRow[] = [
  R("安東", "s-ando", "安東茉優", "outsourcing", 25),
  R("井殿", "s-idono", "井殿康和", "payroll", 1),
  R("古川", "s-furukawa", "古川博庸", "none", 1),
  R("春馬", "s-urabe", "卜部凡夫", "payroll", 1), // 「春馬」は卜部さんの通称（aliasesで名寄せ済み）
  R("榎本", "s-enomoto", "榎本剛志", "payroll", 1),
];

test("単価は2,000円で、件数×単価が手当額", () => {
  assert.equal(PERSONAL_LESSON_UNIT_PRICE, 2000);
  assert.equal(personalAllowanceAmount(1), 2000);
  assert.equal(personalAllowanceAmount(25), 50000);
  assert.equal(personalAllowanceAmount(0), 0);
});

test("返金で件数がマイナスになっても手当はマイナスにならない", () => {
  assert.equal(personalAllowanceAmount(-3), 0);
});

test("2026-06: 給与に入る手当が明細どおり（井殿1 / 卜部1 / 榎本1 = 各2,000円）", () => {
  const split = splitLessonCounts(JUNE_2026);
  const payroll = mergeByStaff(split.payroll);

  assert.equal(payroll.length, 3);
  assert.equal(sumAmount(payroll), 6000);
  for (const r of payroll) {
    assert.equal(r.qty, 1);
    assert.equal(r.amount, 2000);
  }
  assert.deepEqual(
    payroll.map((r) => r.staff_name).sort(),
    ["井殿康和", "卜部凡夫", "榎本剛志"]
  );
});

test("2026-06: 安東さんは業務委託枠（50,000円）で、給与には入らない", () => {
  const split = splitLessonCounts(JUNE_2026);
  assert.equal(sumAmount(split.outsourcing), 50000);
  assert.equal(split.payroll.some((r) => r.staff_id === "s-ando"), false);
});

test("2026-06: 古川さん（月給）は件数があっても対象外に振り分けられる", () => {
  const split = splitLessonCounts(JUNE_2026);
  assert.equal(split.excluded.length, 1);
  assert.equal(split.excluded[0].staff_name, "古川博庸");
  assert.equal(split.payroll.some((r) => r.staff_id === "s-furukawa"), false);
});

test("担当プロがスタッフに紐付いていない売上は unlinked（取り込まない）", () => {
  const split = splitLessonCounts([
    R("(未設定)", null, null, "payroll", 1),
    R("井殿", "s-idono", "井殿康和", "payroll", 2),
  ]);
  assert.equal(split.unlinked.length, 1);
  assert.equal(split.unlinked[0].pro_name, "(未設定)");
  assert.equal(sumAmount(split.payroll), 4000);
});

test("同じ人が複数の表記で出たら1行に束ねる（卜部＋春馬）", () => {
  const merged = mergeByStaff(
    splitLessonCounts([
      R("卜部", "s-urabe", "卜部凡夫", "payroll", 2),
      R("春馬", "s-urabe", "卜部凡夫", "payroll", 3),
    ]).payroll
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].qty, 5);
  assert.equal(merged[0].amount, 10000);
  assert.equal(merged[0].pro_name, "卜部・春馬");
});
