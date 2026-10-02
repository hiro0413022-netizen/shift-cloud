// 見積・注文書の備考で「＊…＊」を赤字にする分け方（#331・2026-10-02）。実行: npm test
// ユーザー指摘「マイナスや振り込み口座を書くときに赤字にしたい」。
// 閉じ忘れで備考が丸ごと赤くなる、を防ぐのがこのテストの主目的。
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitRedMarks } from "../apps/craft-os/src/lib/format.ts";

test("囲んだところだけ赤くなる", () => {
  assert.deepEqual(splitRedMarks("お振込先 *三菱UFJ銀行 信濃橋支店* まで"), [
    { text: "お振込先 ", red: false },
    { text: "三菱UFJ銀行 信濃橋支店", red: true },
    { text: " まで", red: false },
  ]);
});

test("全角の＊でも効く（日本語入力でそうなる）", () => {
  assert.deepEqual(splitRedMarks("＊お振込手数料はご負担ください＊"), [
    { text: "お振込手数料はご負担ください", red: true },
  ]);
});

test("半角と全角が混ざっても効く", () => {
  assert.deepEqual(splitRedMarks("*赤＊"), [{ text: "赤", red: true }]);
});

test("閉じ忘れた＊は文字のまま＝赤くしない", () => {
  assert.deepEqual(splitRedMarks("お振込先 *三菱UFJ銀行"), [
    { text: "お振込先 *三菱UFJ銀行", red: false },
  ]);
});

test("＊だけ・空の囲みは赤くしない", () => {
  assert.deepEqual(splitRedMarks("*"), [{ text: "*", red: false }]);
  assert.deepEqual(splitRedMarks("**"), [{ text: "**", red: false }]);
});

test("改行をまたいでは赤くしない（1行の中だけ）", () => {
  assert.deepEqual(splitRedMarks("*あ\nい*"), [{ text: "*あ\nい*", red: false }]);
});

test("2か所でも別々に赤くなる", () => {
  assert.deepEqual(splitRedMarks("*あ*と*い*"), [
    { text: "あ", red: true },
    { text: "と", red: false },
    { text: "い", red: true },
  ]);
});

test("＊が無い・空は素通し", () => {
  assert.deepEqual(splitRedMarks("ふつうの備考"), [{ text: "ふつうの備考", red: false }]);
  assert.deepEqual(splitRedMarks(""), []);
  assert.deepEqual(splitRedMarks(null), []);
});
