import test from "node:test";
import assert from "node:assert/strict";
import { bookableDates, isBookable, type BookingHours } from "../apps/reserve-os/src/lib/reserve.ts";

/* ============================================================
   フィッティング予約の日付と曜日のズレ（2026-08-24 発見のバグの固定）

   背景: 曜日を new Date(`${ymd}T00:00:00+09:00`).getUTCDay() で求めていた。
   これは絶対時刻が「前日15:00 UTC」になるため、getUTCDay() は1日前の曜日を返す。
   → 選択肢が「8月24日(日)」のように1日ズレて表示され、
     定休日の除外も1日ズレていた（実際の定休日が選べ、営業日が選べない）。
   ============================================================ */

const HOURS: BookingHours = {
  closedWeekdays: [],
  openTime: "11:00",
  closeTime: "18:00",
  slotStepMin: 30,
  windowDays: 14,
  minLeadDays: 1,
};

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

test("bookableDates: ラベルの曜日が実際の曜日と一致する", () => {
  const list = bookableDates(HOURS, "2026-08-24"); // 2026-08-24 は月曜
  for (const d of list) {
    const [y, m, day] = d.value.split("-").map(Number);
    const expected = DOW[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
    assert.equal(d.label, `${m}月${day}日(${expected})`, `${d.value} のラベルがズレている`);
  }
  // 起点の翌日 2026-08-25 は火曜
  assert.equal(list[0].value, "2026-08-25");
  assert.equal(list[0].label, "8月25日(火)");
});

test("bookableDates: 定休日（火曜）が正しく除外される", () => {
  const h = { ...HOURS, closedWeekdays: [2] };
  const list = bookableDates(h, "2026-08-24");
  assert.ok(!list.some((d) => d.value === "2026-08-25"), "火曜が除外されていない");
  assert.ok(list.some((d) => d.value === "2026-08-26"), "水曜まで除外されている");
});

test("isBookable: 定休日の曜日判定がbookableDatesと一致する", () => {
  const h = { ...HOURS, closedWeekdays: [2] };
  // ⚠ 基準日を固定して渡す。省略すると「今日」が基準になり、
  //   このテストは 2026-08-26 の11時を過ぎた瞬間から落ちる時限爆弾だった（#157で修正）。
  assert.equal(isBookable(h, "2026-08-25", "11:00", 60, "2026-08-24"), false); // 火曜=定休
  assert.equal(isBookable(h, "2026-08-26", "11:00", 60, "2026-08-24"), true);  // 水曜=営業
});
