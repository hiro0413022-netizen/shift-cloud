import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BOOKING_CFG,
  businessHours,
  planHours,
  isWeekendOrHoliday,
  lightWindow,
  type BookingCfg,
} from "../packages/core/src/frank-booking.ts";

/* ============================================================
   ライト会員の利用時間帯（#297・2026-09-28）

   運営マニュアル第3版の「ライト会員＝月4回まで／平日10:00〜15:00」が
   予約システムに入っておらず、土日も 22:00 まで取れていた。
   画面（空き枠）とサーバー（予約作成）が同じ planHours() を通る。
   ============================================================ */

const cfg: BookingCfg = { ...DEFAULT_BOOKING_CFG, open_date: "2026-09-02" };

// 2026-09-30(水)・2026-10-03(土)・2026-10-04(日)・2026-10-12(月・スポーツの日)・2026-09-29(火・定休)
test("既定の設定は 平日10:00〜15:00・土日祝は不可", () => {
  assert.deepEqual(lightWindow(cfg), { open: "10:00", close: "15:00", weekday_only: true });
});

test("平日: ライト会員は 10:00〜15:00 に狭まる（営業は10:00〜22:00のまま）", () => {
  const h = businessHours("2026-09-30", cfg);
  assert.deepEqual(h, { open: "10:00", close: "22:00" });
  const r = planHours("ライト会員", "2026-09-30", h, cfg);
  assert.deepEqual(r.hours, { open: "10:00", close: "15:00" });
  assert.equal(r.limited, true);
});

test("土日: ライト会員は枠なし（理由つき）", () => {
  for (const d of ["2026-10-03", "2026-10-04"]) {
    const h = businessHours(d, cfg);
    assert.ok(h, `${d} は営業日`);
    const r = planHours("ライト会員", d, h, cfg);
    assert.equal(r.hours, null);
    assert.match(r.reason ?? "", /土日祝/);
  }
});

test("祝日（月曜）も土日祝あつかいで枠なし", () => {
  assert.equal(isWeekendOrHoliday("2026-10-12", cfg), true);
  const r = planHours("ライト会員", "2026-10-12", businessHours("2026-10-12", cfg), cfg);
  assert.equal(r.hours, null);
});

test("定休日はプランに関係なく null（広がらない）", () => {
  assert.equal(businessHours("2026-09-29", cfg), null);
  assert.deepEqual(planHours("ライト会員", "2026-09-29", null, cfg), { hours: null, limited: false });
});

test("レギュラー・マスター・法人ライト・プラチナは営業時間のまま", () => {
  const h = businessHours("2026-10-03", cfg);
  for (const p of ["レギュラー会員", "マスター会員", "法人ライトプラン", "プラチナレギュラープラン", null, undefined]) {
    const r = planHours(p, "2026-10-03", h, cfg);
    assert.deepEqual(r.hours, h);
    assert.equal(r.limited, false);
  }
});

test("設定で時間帯を変えられる／weekday_only=false なら土日も時間帯内で可", () => {
  const c: BookingCfg = { ...cfg, light_window: { open: "11:00", close: "16:00", weekday_only: false } };
  const r = planHours("ライト会員", "2026-10-03", businessHours("2026-10-03", c), c);
  assert.deepEqual(r.hours, { open: "11:00", close: "16:00" });
});

test("時間帯が営業時間と重ならなければ枠なし", () => {
  const c: BookingCfg = { ...cfg, light_window: { open: "06:00", close: "09:00", weekday_only: true } };
  const r = planHours("ライト会員", "2026-09-30", businessHours("2026-09-30", c), c);
  assert.equal(r.hours, null);
});
