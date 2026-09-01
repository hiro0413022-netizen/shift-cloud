import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BOOKING_CFG,
  genSlots,
  memberStartStep,
  memberMinutesOptions,
  lessonOption,
  grainOf,
  coveredCells,
} from "../packages/core/src/frank-booking.ts";

/* ============================================================
   会員の打席予約は「毎時00分スタート・1時間 or 2時間」（2026-09-01 ユーザー確定）

   - お客様の刻み（member_start_step）と、台帳・スタッフ画面の刻み（slot_minutes）は別。
     スタッフは今までどおり 14:30〜30分 のような予約も入れられる。
   - 端数の予約（14:30〜／25分レッスン）も空き判定のマスを必ず塗る。
     ここを取り違えると「サイトでは○なのに実は埋まっている」二重予約になる。
   ============================================================ */

const cfg = { ...DEFAULT_BOOKING_CFG };

test("既定はお客様=毎時00分・1時間/2時間、スタッフ=30分刻みのまま", () => {
  assert.equal(memberStartStep(cfg), 60);
  assert.deepEqual(memberMinutesOptions(cfg), [60, 120]);
  assert.equal(cfg.slot_minutes, 30); // スタッフ側は変えない
  assert.deepEqual(cfg.max_minutes_options, [30, 60, 90, 120]);
});

test("平日10:00-22:00 の開始時刻は 10:00〜21:00 の12本（30分刻みの24本ではない）", () => {
  const slots = genSlots({ open: "10:00", close: "22:00" }, memberStartStep(cfg));
  assert.equal(slots.length, 12);
  assert.equal(slots[0], "10:00");
  assert.equal(slots[slots.length - 1], "21:00");
  assert.ok(!slots.some((t) => t.endsWith(":30")));
});

test("土日祝 9:00-20:00 は 9:00〜19:00 の11本", () => {
  const slots = genSlots({ open: "09:00", close: "20:00" }, memberStartStep(cfg));
  assert.deepEqual(slots, ["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"]);
});

test("空き判定のマスは30分（お客様が60分刻みでも、台帳の30分ズレを見落とさない）", () => {
  assert.equal(grainOf(cfg), 30);
  // スタッフが電話で入れた 14:30〜15:30 は 14:30 と 15:00 のマスを塗る
  assert.deepEqual(coveredCells("14:30", "15:30", 30), ["14:30", "15:00"]);
  // 25分のパーソナルレッスンも、始まりのマスを必ず1つ塗る
  assert.deepEqual(coveredCells("14:00", "14:25", 30), ["14:00"]);
  // 端数開始（14:35〜15:00）でもマスの頭に丸めて塗る＝塗り残しが出ない
  assert.deepEqual(coveredCells("14:35", "15:00", 30), ["14:30"]);
  assert.deepEqual(coveredCells("14:00", "14:00", 30), []);
});

test("14:30〜の予約があると、60分刻みの14:00も15:00も空きにならない", () => {
  const used = new Set(coveredCells("14:30", "15:30", 30));
  const free = (start: string, minutes: number) =>
    !coveredCells(start, `${String(Math.floor((Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + minutes) / 60)).padStart(2, "0")}:${String((Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5)) + minutes) % 60).padStart(2, "0")}`, 30).some((c) => used.has(c));
  assert.equal(free("14:00", 60), false); // 14:30 が埋まっている
  assert.equal(free("15:00", 60), false); // 15:00 が埋まっている
  assert.equal(free("16:00", 60), true);
  assert.equal(free("13:00", 60), true);
  assert.equal(free("13:00", 120), false); // 2時間だと 14:30 に当たる
});

test("パーソナルレッスンのオプションは25分・2,500円で既定オン", () => {
  const o = lessonOption(cfg);
  assert.equal(o.enabled, true);
  assert.equal(o.minutes, 25);
  assert.equal(o.price, 2500);
  // 料金0で受付を止められる
  assert.equal(lessonOption({ ...cfg, lesson_option: { enabled: false, minutes: 25, price: 0 } }).enabled, false);
});

test("設定で30分刻みに戻せる（お客様側だけ）", () => {
  const back = { ...cfg, member_start_step: 30, member_minutes_options: [30, 60, 90, 120] };
  assert.equal(memberStartStep(back), 30);
  assert.deepEqual(memberMinutesOptions(back), [30, 60, 90, 120]);
  assert.equal(genSlots({ open: "10:00", close: "22:00" }, memberStartStep(back)).length, 24);
});
