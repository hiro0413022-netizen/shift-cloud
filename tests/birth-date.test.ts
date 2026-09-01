import test from "node:test";
import assert from "node:assert/strict";
import { birthDateError, normalizeBirthDate, ageOn } from "../packages/core/src/birth-date.ts";

/* ============================================================
   生年月日の検証（#190）
   体験予約で必須にしたので、画面を経由しない直接POSTでも同じ規則で弾けることを固定する。
   基準日は必ず渡す（環境の日付に依存させると時限爆弾テストになる・#157）。
   ============================================================ */
const TODAY = "2026-09-01";

test("空・形式ちがいは弾く", () => {
  assert.equal(birthDateError("", TODAY), "生年月日をご入力ください");
  assert.equal(birthDateError(null, TODAY), "生年月日をご入力ください");
  assert.equal(birthDateError("1990/01/02", TODAY), "生年月日をご確認ください");
  assert.equal(birthDateError("1990-1-2", TODAY), "生年月日をご確認ください");
});

test("暦に無い日は弾く（2月31日）", () => {
  assert.equal(birthDateError("1990-02-31", TODAY), "生年月日をご確認ください");
  assert.equal(birthDateError("1990-13-01", TODAY), "生年月日をご確認ください");
});

test("うるう年の2月29日は通す", () => {
  assert.equal(birthDateError("2000-02-29", TODAY), null);
  assert.equal(birthDateError("2001-02-29", TODAY), "生年月日をご確認ください");
});

test("未来の日付は弾く。今日は通す", () => {
  assert.equal(birthDateError("2026-09-02", TODAY), "生年月日が未来の日付になっています");
  assert.equal(birthDateError(TODAY, TODAY), null);
});

test("1900年より前は弾く", () => {
  assert.equal(birthDateError("1899-12-31", TODAY), "生年月日をご確認ください");
  assert.equal(birthDateError("1900-01-01", TODAY), null);
});

test("normalizeBirthDate: 通ればそのまま・落ちたらnull", () => {
  assert.equal(normalizeBirthDate("1985-04-13", TODAY), "1985-04-13");
  assert.equal(normalizeBirthDate("1985-04-31", TODAY), null);
});

test("ageOn: 誕生日前はまだ加齢しない", () => {
  assert.equal(ageOn("1985-09-01", TODAY), 41);
  assert.equal(ageOn("1985-09-02", TODAY), 40);
  assert.equal(ageOn("1985-08-31", TODAY), 41);
  assert.equal(ageOn("こわれた値", TODAY), null);
});
