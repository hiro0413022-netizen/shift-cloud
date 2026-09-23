import test from "node:test";
import assert from "node:assert/strict";
import {
  hhmmToMinutes,
  nextYmd,
  shiftCoversMoment,
  staffOnShiftAt,
  shiftDateRange,
} from "../packages/core/src/frank-shift-now.ts";

/* ============================================================
   いま出勤しているのは誰か（#273・ドリンク注文のLINE通知）

   FRANKのシフトの実情（2026-09 実データ）:
     - 時刻が入っている行（小川 13:15〜22:15）
     - 時刻が null で is_day_off=false の行（林・穴田）＝出勤日だけ決まっている
     - draft の行（本人にまだ見えていない）
   ============================================================ */

const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return { date, minutes: h * 60 + m };
};
const row = (o: Partial<Parameters<typeof shiftCoversMoment>[0]> & { staff_id: string; date: string }) => ({
  start_time: null,
  end_time: null,
  is_day_off: false,
  status: "published",
  ...o,
});

test("HH:MM / HH:MM:SS を分に直す", () => {
  assert.equal(hhmmToMinutes("13:15"), 795);
  assert.equal(hhmmToMinutes("13:15:00"), 795);
  assert.equal(hhmmToMinutes("00:00"), 0);
  assert.equal(hhmmToMinutes(null), null);
  assert.equal(hhmmToMinutes(""), null);
});

test("時刻のある勤務は、その時間だけ当たる", () => {
  const r = row({ staff_id: "a", date: "2026-09-24", start_time: "13:15:00", end_time: "22:15:00" });
  assert.equal(shiftCoversMoment(r, at("2026-09-24", "15:00")), true);
  assert.equal(shiftCoversMoment(r, at("2026-09-24", "10:00")), false);
  assert.equal(shiftCoversMoment(r, at("2026-09-24", "23:00")), false);
  assert.equal(shiftCoversMoment(r, at("2026-09-25", "15:00")), false);
});

test("前後15分の余裕がある（開店直前・閉店直後の注文で誰にも飛ばないのを防ぐ）", () => {
  const r = row({ staff_id: "a", date: "2026-09-24", start_time: "13:15:00", end_time: "22:15:00" });
  assert.equal(shiftCoversMoment(r, at("2026-09-24", "13:05")), true); // 10分前
  assert.equal(shiftCoversMoment(r, at("2026-09-24", "22:25")), true); // 10分後
  assert.equal(shiftCoversMoment(r, at("2026-09-24", "12:50")), false); // 25分前は外
  assert.equal(shiftCoversMoment(r, at("2026-09-24", "22:35")), false);
  // 余裕を0にもできる
  assert.equal(shiftCoversMoment(r, at("2026-09-24", "13:05"), 0), false);
});

test("時刻が空の出勤日は終日あつかい（FRANKで実際に多い）", () => {
  const r = row({ staff_id: "b", date: "2026-09-24" });
  assert.equal(shiftCoversMoment(r, at("2026-09-24", "09:00")), true);
  assert.equal(shiftCoversMoment(r, at("2026-09-24", "21:30")), true);
  assert.equal(shiftCoversMoment(r, at("2026-09-25", "09:00")), false);
});

test("休みと下書きには飛ばさない", () => {
  assert.equal(shiftCoversMoment(row({ staff_id: "c", date: "2026-09-24", is_day_off: true }), at("2026-09-24", "12:00")), false);
  assert.equal(shiftCoversMoment(row({ staff_id: "c", date: "2026-09-24", status: "draft" }), at("2026-09-24", "12:00")), false);
});

test("日をまたぐ遅番は翌日の未明まで当たる", () => {
  const r = row({ staff_id: "d", date: "2026-09-24", start_time: "22:00:00", end_time: "01:00:00" });
  assert.equal(shiftCoversMoment(r, at("2026-09-24", "23:30")), true);
  assert.equal(shiftCoversMoment(r, at("2026-09-25", "00:30")), true);
  assert.equal(shiftCoversMoment(r, at("2026-09-25", "02:00")), false);
  // 前日の日中には当たらない
  assert.equal(shiftCoversMoment(r, at("2026-09-24", "12:00")), false);
});

test("同じ人が2行あっても1回だけ返る", () => {
  const rows = [
    row({ staff_id: "a", date: "2026-09-24", start_time: "09:00:00", end_time: "13:00:00" }),
    row({ staff_id: "a", date: "2026-09-24", start_time: "13:00:00", end_time: "18:00:00" }),
    row({ staff_id: "b", date: "2026-09-24" }),
    row({ staff_id: "z", date: "2026-09-24", is_day_off: true }),
  ];
  assert.deepEqual(staffOnShiftAt(rows, at("2026-09-24", "13:30")), ["a", "b"]);
});

test("9/24 の実データどおりに動く（穴田 9:45-18:45 / 小川 13:15-22:15 / 林 休み）", () => {
  const rows = [
    row({ staff_id: "anada", date: "2026-09-24", start_time: "09:45:00", end_time: "18:45:00" }),
    row({ staff_id: "ogawa", date: "2026-09-24", start_time: "13:15:00", end_time: "22:15:00" }),
    row({ staff_id: "hayashi", date: "2026-09-24", is_day_off: true }),
    row({ staff_id: "fujita", date: "2026-09-24", start_time: "09:45:00", end_time: "18:45:00", status: "draft" }),
  ];
  assert.deepEqual(staffOnShiftAt(rows, at("2026-09-24", "11:00")), ["anada"]);
  assert.deepEqual(staffOnShiftAt(rows, at("2026-09-24", "15:00")), ["anada", "ogawa"]);
  assert.deepEqual(staffOnShiftAt(rows, at("2026-09-24", "20:00")), ["ogawa"]);
  assert.deepEqual(staffOnShiftAt(rows, at("2026-09-24", "23:00")), []);
});

test("読む日付の範囲は前日から（日またぎを落とさない）", () => {
  assert.deepEqual(shiftDateRange(at("2026-09-24", "00:30")), { from: "2026-09-23", to: "2026-09-24" });
  assert.equal(nextYmd("2026-09-30"), "2026-10-01");
  assert.equal(nextYmd("2026-12-31"), "2027-01-01");
});
