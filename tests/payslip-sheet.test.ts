// 給与明細PDFの出勤簿行（payslip-sheet.ts）を固定する。
// 押さえるポイント:
//   (a) 打刻なし日（確定シフトあり・当日以前・勤怠行なし）が行として出る（BUGFIX 2026-08-04 と同じ考え方）
//   (b) 未来のシフト・休み(is_day_off)のシフトは「打刻なし」にしない
//   (c) 出退勤はJSTのHH:MM表示（サーバーはUTC / [[jst-date-rule]]）
//   (d) 遅刻・早退・打刻漏れ・修正済・休憩の手動上書き（＊）が備考に出る
//   (e) 日付昇順に並ぶ / 合計は丸め前の生分数
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSheetDays,
  sumSheetDays,
  type SheetAttendanceDay,
  type SheetShift,
} from "../apps/shift-cloud/src/lib/payslip-sheet.ts";

const A = "staff-a";
const B = "staff-b";

const baseDay: Omit<SheetAttendanceDay, "date"> = {
  staff_id: A,
  clock_in: null,
  clock_out: null,
  break_minutes: 60,
  break_override_minutes: null,
  work_minutes: 480,
  late_minutes: 0,
  early_leave_minutes: 0,
  overtime_minutes: 0,
  is_missing_clock: false,
  status: "auto",
};

const DAYS: SheetAttendanceDay[] = [
  {
    ...baseDay,
    date: "2026-07-02",
    clock_in: "2026-07-02T10:42:00+09:00",
    clock_out: "2026-07-02T19:47:00+09:00",
    late_minutes: 12,
    overtime_minutes: 0,
  },
  {
    ...baseDay,
    date: "2026-07-01",
    clock_in: "2026-07-01T10:45:00+09:00",
    clock_out: "2026-07-01T20:00:00+09:00",
    overtime_minutes: 15,
    break_override_minutes: 45,
    break_minutes: 45,
    status: "corrected",
  },
  // 別スタッフの行は混ざらない
  { ...baseDay, staff_id: B, date: "2026-07-01" },
];

const SHIFTS: SheetShift[] = [
  { staff_id: A, date: "2026-07-01", start_time: "10:45:00", end_time: "19:45:00", is_day_off: false },
  { staff_id: A, date: "2026-07-02", start_time: "10:45:00", end_time: "19:45:00", is_day_off: false },
  // (a) 打刻なし日
  { staff_id: A, date: "2026-07-03", start_time: "10:45:00", end_time: "19:45:00", is_day_off: false },
  // (b) 休みシフトは出さない
  { staff_id: A, date: "2026-07-04", start_time: null, end_time: null, is_day_off: true },
  // (b) 未来のシフトは出さない（todayJst=2026-07-10）
  { staff_id: A, date: "2026-07-15", start_time: "10:45:00", end_time: "19:45:00", is_day_off: false },
  // 別スタッフのシフトは混ざらない
  { staff_id: B, date: "2026-07-03", start_time: "11:00:00", end_time: "20:00:00", is_day_off: false },
];

test("日付昇順・打刻なし行・未来と休みの除外", () => {
  const rows = buildSheetDays(DAYS, SHIFTS, A, "2026-07-10");
  assert.deepEqual(
    rows.map((r) => r.date),
    ["2026-07-01", "2026-07-02", "2026-07-03"]
  );

  const missing = rows[2];
  assert.equal(missing.workMinutes, null);
  assert.equal(missing.clockIn, "—");
  assert.equal(missing.breakLabel, "—");
  assert.deepEqual(missing.notes, ["打刻なし"]);
  assert.equal(missing.shiftLabel, "10:45〜19:45");
});

test("JST表示・シフト・休憩・備考", () => {
  const rows = buildSheetDays(DAYS, SHIFTS, A, "2026-07-10");

  const d1 = rows[0]; // 7/1 修正済・休憩手動45分・残業15分
  assert.equal(d1.dateLabel, "7/1（水）");
  assert.equal(d1.clockIn, "10:45");
  assert.equal(d1.clockOut, "20:00");
  assert.equal(d1.breakLabel, "45分＊");
  assert.equal(d1.overtimeMinutes, 15);
  assert.deepEqual(d1.notes, ["修正済"]);

  const d2 = rows[1]; // 7/2 遅刻12分
  assert.equal(d2.clockIn, "10:42");
  assert.equal(d2.breakLabel, "60分");
  assert.deepEqual(d2.notes, ["遅刻12分"]);
});

test("合計は丸め前の生分数＋打刻なし件数", () => {
  const rows = buildSheetDays(DAYS, SHIFTS, A, "2026-07-10");
  const t = sumSheetDays(rows);
  assert.equal(t.workMinutes, 960);
  assert.equal(t.overtimeMinutes, 15);
  assert.equal(t.daysWorked, 2);
  assert.equal(t.missingDays, 1);
});

/* ---- シンプル版（出勤簿・パーソナル件数） ---- */
import { personalCountsByDate, buildSimpleRows } from "../apps/shift-cloud/src/lib/payslip-sheet.ts";

test("personalCountsByDate: 名前・別名でスタッフに結び、日別に足す（返金はマイナス）", () => {
  const pros = [
    { name: "卜部", aliases: ["春馬"], staff_id: "s1" },
    { name: "井殿", aliases: null, staff_id: "s2" },
  ];
  const rows = [
    { sold_on: "2026-09-10", qty: 1, raw_pro: "卜部" },
    { sold_on: "2026-09-10", qty: 2, raw_pro: "春馬" },
    { sold_on: "2026-09-12", qty: 1, raw_pro: "井殿" },
    { sold_on: "2026-09-13", qty: -1, raw_pro: "卜部" },
    { sold_on: "2026-09-14", qty: 1, raw_pro: null },
  ];
  const m = personalCountsByDate(rows, pros, "s1");
  assert.deepEqual(Object.fromEntries(m), { "2026-09-10": 3, "2026-09-13": -1 });
});

test("buildSimpleRows: Excel出勤簿と同じ5列・合計・打刻なし・出勤外のパーソナル日も行に", () => {
  const day = (date: string, work: number | null) => ({
    date, dateLabel: "", shiftLabel: "", clockIn: work == null ? "—" : "10:45", clockOut: work == null ? "—" : "19:45",
    breakLabel: "60分", workMinutes: work, overtimeMinutes: 0, notes: work == null ? ["打刻なし"] : [],
  });
  const r = buildSimpleRows(
    [day("2026-09-02", 480), day("2026-09-05", 510), day("2026-09-07", null)],
    new Map([["2026-09-05", 2], ["2026-09-06", 1]]),
  );
  assert.deepEqual(r.rows.map((x) => [x.dateLabel, x.clockIn, x.clockOut, x.work, x.personal]), [
    ["9月2日", "10:45", "19:45", "8:00", 0],
    ["9月5日", "10:45", "19:45", "8:30", 2],
    ["9月6日", "", "", "", 1],
    ["9月7日", "", "", "打刻なし", 0],
  ]);
  assert.equal(r.totalWorkLabel, "16:30");
  assert.equal(r.daysWorked, 2);
  assert.equal(r.personalTotal, 3);
});
