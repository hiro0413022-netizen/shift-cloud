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

test("オープン初日(9/2 水)は 10:00〜22:00（平日closeに合わせる）", () => {
  assert.deepEqual(businessHours("2026-09-02", cfg), { open: "10:00", close: "22:00" });
});

test("オープン翌日以降は通常の営業時間（9/5 土は 9:00〜20:00）", () => {
  assert.deepEqual(businessHours("2026-09-03", cfg), { open: "10:00", close: "22:00" });
  assert.deepEqual(businessHours("2026-09-05", cfg), { open: "09:00", close: "20:00" });
});

test("火曜定休は変わらず休み（9/8）", () => {
  assert.equal(businessHours("2026-09-08", cfg), null);
});

test("枠は閉業時間を超えない（22:00閉店→最終枠は21:30開始）", () => {
  const slots = genSlots({ open: "10:00", close: "22:00" }, 30);
  assert.equal(slots[0], "10:00");
  assert.equal(slots[slots.length - 1], "21:30");
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

/* ============================================================
   特別営業日（#118）: 内覧会・体験会などオープン前の特定日だけ予約を受け付ける。
   /site-admin「予約設定」の special_open_dates で設定（デプロイ不要）。
   ============================================================ */

test("特別営業日: オープン前でもその日だけ営業時間が出る（他の日は出ない）", () => {
  const c = { ...cfg, special_open_dates: ["2026-08-16"] };
  assert.deepEqual(businessHours("2026-08-16", c), { open: "09:00", close: "20:00" }); // 日曜=weekend
  assert.equal(businessHours("2026-08-15", c), null); // 前日は通常どおり閉まったまま
});

test("特別営業日: 定休曜日・臨時休業の指定より優先する", () => {
  const c = { ...cfg, special_open_dates: ["2026-08-18"], closed_dates: ["2026-08-18"] };
  // 8/18は火曜（定休）かつ臨時休業指定でも、特別営業日なら開く
  assert.deepEqual(businessHours("2026-08-18", c), { open: "10:00", close: "22:00" });
});

test("特別営業日: 予約可能範囲がその日まで前倒しされる（オープン日以降の範囲は狭まらない）", () => {
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  if (today < "2026-08-16") {
    const r = bookableRange({ ...cfg, special_open_dates: ["2026-08-16"] });
    assert.equal(r.min, "2026-08-16");
    assert.equal(r.max, "2026-09-16"); // maxはopen_date基準のまま
  }
  // 過去の特別営業日は無視される
  const r2 = bookableRange({ ...cfg, special_open_dates: ["2020-01-01"] });
  assert.ok(r2.min >= "2026-01-01");
});

test("open_timeが営業openより遅い日だけ開始が繰り下がる（他日は影響なし）", () => {
  // 9/2 は weekday open 10:00 と同じなのでそのまま。土日オープンだったら 10:00 に繰り下がる想定の確認
  const weekendOpenCfg = { ...cfg, open_date: "2026-09-05" }; // 土曜: 9:00開店だが受付は10:00から
  assert.deepEqual(businessHours("2026-09-05", weekendOpenCfg), { open: "10:00", close: "20:00" });
});
