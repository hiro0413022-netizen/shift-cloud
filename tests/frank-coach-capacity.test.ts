import { test } from "node:test";
import assert from "node:assert/strict";
import { coachCapacity, trialsAt, canTakeTrial, NO_SHIFT_CAPACITY } from "@yozan/core/frank-coach-capacity";

const hm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const span = (a: string, b: string) => ({ s: hm(a), e: hm(b) });
/** 体験1件ぶん（案内は約55分・#212 はこの時間ずっといる人だけ数える） */
const trial = (a: string) => ({ s: hm(a), e: hm(a) + 55 });

test("コーチ2人 → 2人まで、3人目は不可", () => {
  const cover = [span("09:45", "18:45"), span("13:15", "22:15")];
  const t = trial("14:00");
  assert.equal(coachCapacity(cover, t.s, t.e), 2);
  assert.equal(canTakeTrial(cover, [], t.s, t.e), true);
  assert.equal(canTakeTrial(cover, [trial("14:00")], t.s, t.e), true);
  assert.equal(canTakeTrial(cover, [trial("14:00"), trial("14:00")], t.s, t.e), false);
});

test("コーチ1人 → 1人まで", () => {
  const cover = [span("09:45", "18:45")];
  const t = trial("10:00");
  assert.equal(coachCapacity(cover, t.s, t.e), 1);
  assert.equal(canTakeTrial(cover, [], t.s, t.e), true);
  assert.equal(canTakeTrial(cover, [trial("10:00")], t.s, t.e), false);
});

test("体験の途中で上がる人は数えない（18:45上がりに18:00開始は任せられない）", () => {
  const cover = [span("09:45", "18:45")];
  const t = trial("18:00"); // 18:00〜18:55
  assert.equal(coachCapacity(cover, t.s, t.e), 0);
  assert.equal(canTakeTrial(cover, [], t.s, t.e), false);
  // 17:00開始なら最後までいる
  const ok = trial("17:00");
  assert.equal(coachCapacity(cover, ok.s, ok.e), 1);
});

test("遅番だけの時間はコーチ0人（打席が空いていても受けない）", () => {
  const cover = [span("13:15", "22:15")];
  const t = trial("10:00");
  assert.equal(coachCapacity(cover, t.s, t.e), 0);
  assert.equal(canTakeTrial(cover, [], t.s, t.e), false);
});

test("シフト未確定の日は2名まで（null＝まだ組んでいない）", () => {
  const t = trial("14:00");
  assert.equal(NO_SHIFT_CAPACITY, 2);
  assert.equal(coachCapacity(null, t.s, t.e), 2);
  assert.equal(canTakeTrial(null, [trial("14:00")], t.s, t.e), true);
  assert.equal(canTakeTrial(null, [trial("14:00"), trial("14:00")], t.s, t.e), false);
});

test("全員休みの日は0人（＝受け付けない）", () => {
  const t = trial("14:00");
  assert.equal(coachCapacity([], t.s, t.e), 0);
  assert.equal(canTakeTrial([], [], t.s, t.e), false);
});

test("重なりの数え方: 時間が重なる体験だけ数える", () => {
  const t = trial("14:00"); // 14:00-14:55
  assert.equal(trialsAt([trial("13:00")], t.s, t.e), 0); // 13:00-13:55 は重ならない
  assert.equal(trialsAt([{ s: hm("14:30"), e: hm("15:30") }], t.s, t.e), 1);
  assert.equal(trialsAt([trial("14:00"), trial("15:00")], t.s, t.e), 1);
});

test("すでに上限を超えている時間帯は、増やさないだけで消さない", () => {
  // 打席3件ぶん先に入っている時間にコーチ2人 → 追加は不可（既存3件はそのまま）
  const cover = [span("09:45", "18:45"), span("09:45", "18:45")];
  const already = [trial("11:00"), trial("11:00"), trial("11:00")];
  const t = trial("11:00");
  assert.equal(trialsAt(already, t.s, t.e), 3);
  assert.equal(canTakeTrial(cover, already, t.s, t.e), false);
});
