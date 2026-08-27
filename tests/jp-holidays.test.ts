import test from "node:test";
import assert from "node:assert/strict";
import { isJpHoliday, jpHolidayName } from "../packages/core/src/jp-holidays.ts";
import { businessHours, DEFAULT_BOOKING_CFG } from "../packages/core/src/frank-booking.ts";

/* ============================================================
   祝日の自動判定（2026-08-27）

   FRANK GOLF は「平日 10:00〜22:00 / 土日祝 9:00〜20:00」。
   祝日を gn_site_content に手で並べる運用だと、並べ終わった先の月から
   祝日が平日あつかいになり 9:00 の枠が出なくなる。計算で出すようにした。
   ============================================================ */

test("固定日の祝日", () => {
  assert.equal(jpHolidayName("2026-01-01"), "元日");
  assert.equal(jpHolidayName("2026-02-11"), "建国記念の日");
  assert.equal(jpHolidayName("2026-11-03"), "文化の日");
  assert.equal(jpHolidayName("2026-11-23"), "勤労感謝の日");
});

test("ハッピーマンデー", () => {
  assert.equal(jpHolidayName("2026-01-12"), "成人の日");   // 1月第2月曜
  assert.equal(jpHolidayName("2026-07-20"), "海の日");     // 7月第3月曜
  assert.equal(jpHolidayName("2026-09-21"), "敬老の日");   // 9月第3月曜
  assert.equal(jpHolidayName("2026-10-12"), "スポーツの日"); // 10月第2月曜
});

test("春分・秋分", () => {
  assert.equal(jpHolidayName("2026-03-20"), "春分の日");
  assert.equal(jpHolidayName("2026-09-23"), "秋分の日");
  assert.equal(jpHolidayName("2027-03-21"), "春分の日");
});

test("国民の休日（敬老の日と秋分の日に挟まれた 2026-09-22）", () => {
  assert.equal(jpHolidayName("2026-09-22"), "国民の休日");
});

test("振替休日（2027-03-21 春分が日曜 → 3/22 月曜）", () => {
  assert.equal(jpHolidayName("2027-03-22"), "振替休日");
});

test("祝日でない日", () => {
  assert.equal(isJpHoliday("2026-09-24"), false);
  assert.equal(isJpHoliday("2026-12-25"), false); // クリスマスは祝日ではない
});

test("祝日は土日と同じ 9:00〜20:00 になる", () => {
  // 2026-11-03（火）は文化の日だが火曜定休なので休み
  assert.equal(businessHours("2026-11-03", DEFAULT_BOOKING_CFG), null);
  // 2026-11-23（月）勤労感謝の日 → 土日祝の営業時間
  assert.deepEqual(businessHours("2026-11-23", DEFAULT_BOOKING_CFG), { open: "09:00", close: "20:00" });
  // 2026-10-12（月）スポーツの日 → 同上
  assert.deepEqual(businessHours("2026-10-12", DEFAULT_BOOKING_CFG), { open: "09:00", close: "20:00" });
  // 平日（祝日でない月曜）は 10:00〜22:00 のまま
  assert.deepEqual(businessHours("2026-10-19", DEFAULT_BOOKING_CFG), { open: "10:00", close: "22:00" });
});

test("holiday_dates に手で足した日も引き続き土日祝あつかい", () => {
  const cfg = { ...DEFAULT_BOOKING_CFG, holiday_dates: ["2026-12-31"] };
  assert.deepEqual(businessHours("2026-12-31", cfg), { open: "09:00", close: "20:00" });
});

test("auto_holidays:false なら自動判定を止められる", () => {
  const cfg = { ...DEFAULT_BOOKING_CFG, auto_holidays: false };
  assert.deepEqual(businessHours("2026-11-23", cfg), { open: "10:00", close: "22:00" });
});
