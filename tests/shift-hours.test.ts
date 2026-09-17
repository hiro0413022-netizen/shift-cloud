// シフト作成の総労働時間（#255）。休憩の控除は打刻の自動休憩と同じであること、下書きも数えることを固定する。
import test from "node:test";
import assert from "node:assert/strict";
import {
  workMinutesBetween, cellWork, staffPeriodHours, formatWorkHours, type HoursTemplate, type HoursCell,
} from "../apps/shift-cloud/src/lib/shift-hours.ts";

const T = new Map<string, HoursTemplate>([
  ["day", { id: "day", start_time: "11:00:00", end_time: "20:00:00", is_day_off: false }],
  ["short", { id: "short", start_time: "10:00", end_time: "15:00", is_day_off: false }],
  ["off", { id: "off", start_time: null, end_time: null, is_day_off: true }],
  ["allday", { id: "allday", start_time: null, end_time: null, is_day_off: false }],
]);
const cell = (p: Partial<HoursCell>): HoursCell => ({
  template_id: null, schedule_type_id: null, start_time: null, end_time: null, status: "draft", ...p,
});

test("休憩は 6時間超45分・8時間超60分（打刻と同じ）", () => {
  assert.equal(workMinutesBetween("10:00", "15:00"), 300); // 5h → 休憩なし
  assert.equal(workMinutesBetween("10:00", "16:00"), 360); // ちょうど6h → 休憩なし
  assert.equal(workMinutesBetween("10:00", "17:00"), 375); // 7h → 45分
  assert.equal(workMinutesBetween("11:00:00", "20:00:00"), 480); // 9h → 60分
});

test("日またぎ・入力途中", () => {
  assert.equal(workMinutesBetween("18:00", "02:00"), 435); // ちょうど8h（8時間超ではない）→ 45分
  assert.equal(workMinutesBetween("10:00", ""), null);
  assert.equal(workMinutesBetween(null, "19:00"), null);
  assert.equal(workMinutesBetween("25:00", "26:00"), null);
});

test("マスの種類", () => {
  assert.deepEqual(cellWork(cell({ template_id: "day" }), T), { kind: "work", minutes: 480 });
  assert.deepEqual(cellWork(cell({ template_id: "off" }), T), { kind: "off", minutes: 0 });
  assert.deepEqual(cellWork(cell({ template_id: "allday" }), T), { kind: "duty", minutes: 0 });
  assert.deepEqual(cellWork(cell({ schedule_type_id: "caddy" }), T), { kind: "duty", minutes: 0 });
  assert.deepEqual(cellWork(cell({ start_time: "10:00", end_time: "19:00" }), T), { kind: "work", minutes: 480 });
  assert.deepEqual(cellWork(cell({ template_id: "unknown" }), T), { kind: "none", minutes: 0 });
  assert.deepEqual(cellWork(undefined, T), { kind: "none", minutes: 0 });
});

test("表示中の期間だけ・下書きも数える", () => {
  const grid: Record<string, HoursCell> = {
    "a|2026-10-01": cell({ template_id: "day", status: "published" }),
    "a|2026-10-02": cell({ template_id: "short" }),
    "a|2026-10-03": cell({ template_id: "off" }),
    "a|2026-10-04": cell({ schedule_type_id: "caddy" }),
    "a|2026-10-20": cell({ template_id: "day" }), // 期間外
    "b|2026-10-01": cell({ template_id: "day" }), // 別の人
  };
  const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
  assert.deepEqual(staffPeriodHours("a", days, grid, T), { minutes: 780, draftMinutes: 300, workDays: 2, dutyDays: 1 });
  assert.deepEqual(staffPeriodHours("c", days, grid, T), { minutes: 0, draftMinutes: 0, workDays: 0, dutyDays: 0 });
});

test("表示の形", () => {
  assert.equal(formatWorkHours(0), "0h");
  assert.equal(formatWorkHours(480), "8h");
  assert.equal(formatWorkHours(510), "8.5h");
  assert.equal(formatWorkHours(525), "8h45m");
  assert.equal(formatWorkHours(7845), "130h45m");
});
