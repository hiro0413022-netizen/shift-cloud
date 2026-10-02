// レッスンノートの「今の課題」の形の整え方（#332・2026-10-02）。実行: npm test
// お客様の画面にもそのまま出る文字なので、保存の形をここで固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FOCUS_EMPTY_MESSAGE,
  FOCUS_MAX,
  focusCount,
  focusLines,
  focusUpdatedLabel,
  hasFocus,
  normalizeFocus,
} from "../packages/core/src/lesson-focus.ts";

const SAMPLE = `① バックスイングで伸び上がらず、前傾を保つ
② 腰から腰のハーフスイングで、腕と体の動きを合わせる
③ フィニッシュで左足にしっかり体重を乗せる`;

test("記入例の3行がそのまま3件として読める", () => {
  assert.equal(focusCount(SAMPLE), 3);
  assert.deepEqual(focusLines(SAMPLE)[0], "① バックスイングで伸び上がらず、前傾を保つ");
  assert.equal(normalizeFocus(SAMPLE), SAMPLE);
});

test("未入力は null・hasFocus は false", () => {
  for (const v of ["", "   ", "\n\n", "　", null, undefined]) {
    assert.equal(normalizeFocus(v), null, JSON.stringify(v));
    assert.equal(hasFocus(v), false);
    assert.equal(focusCount(v), 0);
  }
});

test("Windowsの改行(CRLF)で貼っても壊れない", () => {
  assert.equal(normalizeFocus("あ\r\nい\r\n"), "あ\nい");
  assert.equal(focusCount("あ\r\nい\r\n"), 2);
});

test("前後の空行は落とす・行末の空白も落とす", () => {
  assert.equal(normalizeFocus("\n\n  あ  \nい\t\n\n"), "  あ\nい");
});

test("空行が続いても1つまでに詰める（貼り付けで間延びしない）", () => {
  assert.equal(normalizeFocus("あ\n\n\n\nい"), "あ\n\nい");
});

test("空行は件数に数えない", () => {
  assert.equal(focusCount("あ\n\nい"), 2);
});

test("長すぎる入力は FOCUS_MAX で切る（黙って全部消さない）", () => {
  const long = "あ".repeat(FOCUS_MAX + 500);
  const r = normalizeFocus(long);
  assert.equal(r?.length, FOCUS_MAX);
});

test("最終更新日はJSTの暦日で出す", () => {
  // 2026-10-02 08:20 UTC = JST 17:20 同日
  assert.equal(focusUpdatedLabel("2026-10-02T08:20:00Z"), "2026年10月2日");
  // 2026-10-02 15:30 UTC = JST 翌日 0:30
  assert.equal(focusUpdatedLabel("2026-10-02T15:30:00Z"), "2026年10月3日");
});

test("更新日が無い・壊れているときは空文字（「Invalid Date」を出さない）", () => {
  assert.equal(focusUpdatedLabel(null), "");
  assert.equal(focusUpdatedLabel(""), "");
  assert.equal(focusUpdatedLabel("きのう"), "");
});

test("未入力の文言はユーザー指定のまま", () => {
  assert.equal(FOCUS_EMPTY_MESSAGE, "現在の課題はまだ登録されていません");
});
