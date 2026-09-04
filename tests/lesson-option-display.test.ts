import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingToItem, lessonBadge, LESSON_OPT_EDGE, type BookingLike } from "../apps/member-os/src/lib/bay-timeline-pure.ts";
import { coachesForLesson, overlapMinutes } from "@yozan/core/frank-coach-capacity";

const hm = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

const base: BookingLike = {
  id: "b1",
  bay_id: "A",
  start_time: "14:00:00",
  end_time: "15:00:00",
  status: "confirmed",
  customer_kind: "member",
  guest_name: null,
  party_size: null,
  frunk_members: { name: "梶原 三男", alert_note: null },
  mbr_trial_requests: null,
};

test("チケットで承ったレッスンは🎫と担当名が出る（#214）", () => {
  const it = bookingToItem(
    { ...base, lesson_option_status: "confirmed", lesson_option_start: "14:30:00", lesson_option_fee: 0, lesson_option_staff_id: "s1" },
    () => "小川うらら",
  );
  assert.equal(it.lessonOpt, "confirmed");
  assert.equal(it.lessonTicket, true);
  assert.equal(it.lessonStart, "14:30");
  assert.equal(lessonBadge(it), "🎫 レッスン14:30 小川うらら");
  assert.match(LESSON_OPT_EDGE[it.lessonOpt!], /violet/);
});

test("現金（当日精算）のレッスンは🎫を出さない", () => {
  const it = bookingToItem(
    { ...base, lesson_option_status: "confirmed", lesson_option_start: "14:30:00", lesson_option_fee: 2500, lesson_option_staff_id: "s1" },
    () => "穴田 賢太",
  );
  assert.equal(it.lessonTicket, false);
  assert.equal(lessonBadge(it), "レッスン14:30 穴田 賢太");
});

test("ご希望のまま（未確定）は希望と分かる色・文言になる", () => {
  const it = bookingToItem({ ...base, lesson_option_status: "requested", lesson_option_fee: 2500, lesson_option_staff_id: "s9" }, () => "林 和希");
  assert.equal(it.lessonOpt, "requested");
  assert.equal(it.lessonStart, ""); // 開始時刻は店舗が決めるまで出さない
  assert.equal(lessonBadge(it), "レッスン希望 林 和希");
  assert.match(LESSON_OPT_EDGE[it.lessonOpt!], /amber/);
});

test("レッスンなしの予約には印を出さない（表を散らかさない）", () => {
  const it = bookingToItem(base);
  assert.equal(it.lessonOpt, null);
  assert.equal(it.lessonTicket, false);
  assert.equal(lessonBadge(it), "");
});

test("お断りした希望は印を出さない", () => {
  const it = bookingToItem({ ...base, lesson_option_status: "declined" });
  assert.equal(it.lessonOpt, null);
  assert.equal(lessonBadge(it), "");
});

test("指名できるコーチは「レッスンぶん一緒にいられる人」だけ（#213）", () => {
  const coaches = [
    { id: "early", s: hm("08:45"), e: hm("14:15") },
    { id: "late", s: hm("13:15"), e: hm("22:15") },
    { id: "off", s: hm("18:00"), e: hm("22:00") },
  ];
  // 14:00〜15:00 の打席予約に25分のレッスンを付ける
  const s = hm("14:00");
  const e = hm("15:00");
  assert.equal(overlapMinutes(coaches[0], s, e), 15); // 14:15上がり → 25分に足りない
  const ok = coachesForLesson(coaches, s, e, 25).map((c) => c.id);
  assert.deepEqual(ok, ["late"]);
});

test("2時間の打席予約なら、途中から入るコーチも指名できる", () => {
  const coaches = [{ id: "late", s: hm("13:15"), e: hm("22:15") }];
  const ok = coachesForLesson(coaches, hm("12:00"), hm("14:00"), 25).map((c) => c.id);
  assert.deepEqual(ok, ["late"]);
});
