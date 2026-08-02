import test from "node:test";
import assert from "node:assert/strict";
import {
  businessHours,
  bookableRange,
  genSlots,
  DEFAULT_BOOKING_CFG,
} from "../packages/core/src/frank-booking.ts";

/* ============================================================
   FRANK GOLF 9/2プレオープンの予約ゲート（#97）

   ユーザー指示（2026-08-03）:
   - 予約できるのは 2026-09-02 10:00 から（体験・打席・レッスン共通）
   - 予約可能時間は閉業時間まで（枠は閉店を超えない）
   - 打席は A/B/C のみ（Dは frunk_bays.active=false で除外＝DB側）
   ============================================================ */

const cfg = { ...DEFAULT_BOOKING_CFG };

test("オープン日より前は営業時間なし（＝予約不可）", () => {
  assert.equal(businessHours("2026-08-15", cfg), null);
  assert.equal(businessHours("2026-09-01", cfg), null);
});

test("オープン初日(9/2 水)は 10:00〜21:00（平日closeに合わせる）", () => {
  assert.deepEqual(businessHours("2026-09-02", cfg), { open: "10:00", close: "21:00" });
});

test("オープン翌日以降は通常の営業時間（9/5 土は 8:00〜20:00）", () => {
  assert.deepEqual(businessHours("2026-09-03", cfg), { open: "10:00", close: "21:00" });
  assert.deepEqual(businessHours("2026-09-05", cfg), { open: "08:00", close: "20:00" });
});

test("火曜定休は変わらず休み（9/8）", () => {
  assert.equal(businessHours("2026-09-08", cfg), null);
});

test("枠は閉業時間を超えない（21:00閉店→最終枠は20:30開始）", () => {
  const slots = genSlots({ open: "10:00", close: "21:00" }, 30);
  assert.equal(slots[0], "10:00");
  assert.equal(slots[slots.length - 1], "20:30");
});

test("オープン前でも『9/2から14日分』は先行予約できる範囲になる", () => {
  // このテストは today < open_date の間だけ意味を持つ（オープン後は today 基準に戻る）
  const r = bookableRange(cfg);
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  if (today < cfg.open_date) {
    assert.equal(r.min, "2026-09-02");
    assert.equal(r.max, "2026-09-16");
  } else {
    assert.equal(r.min, today);
  }
});

test("open_timeが営業openより遅い日だけ開始が繰り下がる（他日は影響なし）", () => {
  // 9/2 は weekday open 10:00 と同じなのでそのまま。土日オープンだったら 10:00 に繰り下がる想定の確認
  const weekendOpenCfg = { ...cfg, open_date: "2026-09-05" }; // 土曜: 8:00開店だが受付は10:00から
  assert.deepEqual(businessHours("2026-09-05", weekendOpenCfg), { open: "10:00", close: "20:00" });
});
