import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLIENT_FIELDS,
  CLIENT_FIELD_KEYS,
  latestVideoByDay,
  noteVideoId,
  diffOf,
} from "../packages/core/src/lesson-share.ts";

/**
 * お客様に見せるレッスンの中身（#210）。守りたいのは3つ:
 *   ① 会員ページと共有ページで**同じ8項目**が出る（片方だけ増えない）
 *   ② 古いメモ（video_id が無い）も同じ日のスイングの下に出る
 *   ③ 前回比は変化が無いときは出さない
 */

test("お客様に出す計測は8項目で、順番も決まっている", () => {
  assert.equal(CLIENT_FIELDS.length, 8);
  assert.deepEqual(CLIENT_FIELD_KEYS, [
    "club_speed",
    "ball_speed",
    "smash_factor",
    "launch_angle",
    "spin_rate",
    "carry",
    "club_path",
    "face_angle",
  ]);
  // ラベルが空のものを混ぜない（画面に「」が出る）
  for (const f of CLIENT_FIELDS) assert.ok(f.label.length > 0, f.key);
});

test("その日の最後のスイングは、新しい順の最初の1本", () => {
  const map = latestVideoByDay([
    { id: "v3", shotAt: "2026-09-03" }, // 同じ日の中でいちばん新しい
    { id: "v2", shotAt: "2026-09-03" },
    { id: "v1", shotAt: "2026-09-01" },
  ]);
  assert.equal(map.get("2026-09-03"), "v3");
  assert.equal(map.get("2026-09-01"), "v1");
  assert.equal(map.get("2026-08-31"), undefined);
});

test("紐づけ済みのメモはその動画、未紐づけは同じ日の最後のスイング", () => {
  const map = latestVideoByDay([{ id: "v3", shotAt: "2026-09-03" }]);
  assert.equal(noteVideoId({ videoId: "v2", lessonDate: "2026-09-03" }, map), "v2");
  assert.equal(noteVideoId({ videoId: null, lessonDate: "2026-09-03" }, map), "v3");
  // その日に動画が無ければ、動画の下には出さない（日付だけのレッスンとして出す）
  assert.equal(noteVideoId({ videoId: null, lessonDate: "2026-08-20" }, map), null);
});

test("前回比は変わっていなければ出さない", () => {
  assert.equal(diffOf(42.5, 40), 2.5);
  assert.equal(diffOf(40, 42.5), -2.5);
  assert.equal(diffOf(40, 40), null);
  assert.equal(diffOf(40, undefined), null);
});
