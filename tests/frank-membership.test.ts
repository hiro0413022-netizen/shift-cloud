import test from "node:test";
import assert from "node:assert/strict";
import {
  monthEnd,
  earliestLeaveDate,
  leaveDateOptions,
  canLeaveOn,
  leaveApplyDeadline,
  earliestSuspendStart,
  suspendStartOptions,
  canSuspendFrom,
  suspendApplyDeadline,
  monthEndLabel,
  monthFromLabel,
} from "../packages/core/src/frank-membership.ts";

/* ============================================================
   退会・休会の受付ルール（2026-09-01 ユーザー確定）

   退会: 効力日は月末。申込月の翌月末より前は選べない。
         「9月末退会なら8月末までの申し込み」
   休会: 開始は月初。当月10日までなら翌月から、11日以降は翌々月から。
         「10月から休会なら9月10日までは受付可能」

   ここを間違えると月会費が1か月ぶん余分に落ちる／止まりすぎる＝そのままお金の事故になる。
   ============================================================ */

test("月末の計算（うるう年・30日月・31日月）", () => {
  assert.equal(monthEnd("2026-09-15"), "2026-09-30");
  assert.equal(monthEnd("2026-10-01"), "2026-10-31");
  assert.equal(monthEnd("2027-02-03"), "2027-02-28");
  assert.equal(monthEnd("2028-02-03"), "2028-02-29"); // うるう年
  assert.equal(monthEnd("2026-12-31"), "2026-12-31");
});

test("退会: 8月中の申し出なら9月末で退会できる", () => {
  assert.equal(earliestLeaveDate("2026-08-01"), "2026-09-30");
  assert.equal(earliestLeaveDate("2026-08-31"), "2026-09-30");
  assert.ok(canLeaveOn("2026-08-31", "2026-09-30"));
});

test("退会: 9月に入ったら9月末退会はもう選べない（最短は10月末）", () => {
  assert.equal(earliestLeaveDate("2026-09-01"), "2026-10-31");
  assert.equal(canLeaveOn("2026-09-01", "2026-09-30"), false);
  assert.ok(canLeaveOn("2026-09-01", "2026-10-31"));
  assert.ok(canLeaveOn("2026-09-30", "2026-10-31"));
});

test("退会: 月末以外の日付は受け付けない（日割りは発生させない）", () => {
  assert.equal(canLeaveOn("2026-09-01", "2026-10-15"), false);
  assert.equal(canLeaveOn("2026-09-01", "2026-10-30"), false); // 10月は31日まで
  assert.equal(canLeaveOn("2026-09-01", "こわれた日付"), false);
});

test("退会: 年をまたいでも崩れない", () => {
  assert.equal(earliestLeaveDate("2026-12-05"), "2027-01-31");
  assert.ok(canLeaveOn("2026-12-05", "2027-01-31"));
});

test("退会: 選択肢は翌月末から並ぶ", () => {
  const opts = leaveDateOptions("2026-09-01", 3);
  assert.deepEqual(opts, ["2026-10-31", "2026-11-30", "2026-12-31"]);
});

test("退会: 申し出の締切は退会月の前月末", () => {
  assert.equal(leaveApplyDeadline("2026-09-30"), "2026-08-31");
  assert.equal(leaveApplyDeadline("2027-01-31"), "2026-12-31");
});

test("休会: 10日までの申し出なら翌月から", () => {
  assert.equal(earliestSuspendStart("2026-09-01"), "2026-10-01");
  assert.equal(earliestSuspendStart("2026-09-10"), "2026-10-01"); // 締切当日はセーフ
  assert.ok(canSuspendFrom("2026-09-10", "2026-10-01"));
});

test("休会: 11日以降の申し出は翌々月から", () => {
  assert.equal(earliestSuspendStart("2026-09-11"), "2026-11-01");
  assert.equal(earliestSuspendStart("2026-09-30"), "2026-11-01");
  assert.equal(canSuspendFrom("2026-09-11", "2026-10-01"), false);
  assert.ok(canSuspendFrom("2026-09-11", "2026-11-01"));
});

test("休会: 月初以外の日付は受け付けない", () => {
  assert.equal(canSuspendFrom("2026-09-01", "2026-10-15"), false);
  assert.equal(canSuspendFrom("2026-09-01", "2026-10-31"), false);
});

test("休会: 年をまたいでも崩れない", () => {
  assert.equal(earliestSuspendStart("2026-12-10"), "2027-01-01");
  assert.equal(earliestSuspendStart("2026-12-11"), "2027-02-01");
});

test("休会: 選択肢は最短月から並ぶ", () => {
  assert.deepEqual(suspendStartOptions("2026-09-11", 3), ["2026-11-01", "2026-12-01", "2027-01-01"]);
});

test("休会: 申し出の締切は前月10日", () => {
  assert.equal(suspendApplyDeadline("2026-10-01"), "2026-09-10");
  assert.equal(suspendApplyDeadline("2027-01-01"), "2026-12-10");
});

test("表示ラベル", () => {
  assert.equal(monthEndLabel("2026-10-31"), "2026年10月末");
  assert.equal(monthFromLabel("2026-10-01"), "2026年10月から");
});
