import { test } from "node:test";
import assert from "node:assert/strict";
import { memberStats, isStaffMember, isTrialMember, inDateWindow, PLACEHOLDER_LEAVE_REASONS } from "../packages/core/src/members.ts";

const FROM = "2026-07-01";
const TO = "2026-08-01";

test("スタッフは顧客会員から除外される", () => {
  const s = memberStats([{ member_type: "スタッフ", join_date: "2026-07-05", leave_date: null }], FROM, TO);
  assert.deepEqual(s, { active: 0, joins: 0, leavesCore: 0, leavesTrial: 0 });
});

test("本会員: 在籍・当月入会・当月退会", () => {
  const s = memberStats(
    [
      { member_type: "正会員", join_date: "2026-07-10", leave_date: null }, // 在籍＋今月入会
      { member_type: "正会員", join_date: "2025-01-01", leave_date: "2026-07-31" }, // 今月退会（月末付）
      { member_type: "正会員", join_date: "2025-01-01", leave_date: null }, // 在籍のみ
      { member_type: "正会員", join_date: "2026-06-30", leave_date: null }, // 先月入会（在籍のみ）
    ],
    FROM,
    TO,
  );
  assert.deepEqual(s, { active: 3, joins: 1, leavesCore: 1, leavesTrial: 0 });
});

test("トライアル会員: 在籍・入会に数えず、退会は別カウント", () => {
  const s = memberStats(
    [
      { member_type: "トライアル会員", join_date: "2026-07-01", leave_date: null },
      { member_type: "トライアル会員", join_date: "2026-06-01", leave_date: "2026-07-15" },
    ],
    FROM,
    TO,
  );
  assert.deepEqual(s, { active: 0, joins: 0, leavesCore: 0, leavesTrial: 1 });
});

test("半開区間 [月初, 翌月初): 翌月1日は含まない", () => {
  assert.equal(inDateWindow("2026-07-01", FROM, TO), true);
  assert.equal(inDateWindow("2026-07-31", FROM, TO), true);
  assert.equal(inDateWindow("2026-08-01", FROM, TO), false);
  assert.equal(inDateWindow(null, FROM, TO), false);
});

test("分類述語とプレースホルダ", () => {
  assert.equal(isStaffMember("スタッフ"), true);
  assert.equal(isStaffMember(null), false);
  assert.equal(isTrialMember("トライアル会員"), true);
  assert.equal(PLACEHOLDER_LEAVE_REASONS.has("選択してください"), true);
  assert.equal(PLACEHOLDER_LEAVE_REASONS.has("引っ越しのため"), false);
});
