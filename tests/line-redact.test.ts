import test from "node:test";
import assert from "node:assert/strict";
import { redactNames, nameVariants, containsHiddenName } from "../packages/core/src/line-redact.ts";

/* ============================================================
   LINEに出さないスタッフ名（#243）
   「一切出さない」なので、氏名・姓＋敬称・姓だけ・名だけ、全部を固定する。
   名前はテスト用の架空の人物。
   ============================================================ */
const HIDDEN = ["山田　太郎"];

test("氏名は全角/半角スペース・スペース無しのどれでも伏せる", () => {
  assert.equal(redactNames("本日の出勤: 山田　太郎(10:00〜)", HIDDEN), "本日の出勤: 担当プロ(10:00〜)");
  assert.equal(redactNames("山田 太郎が担当します", HIDDEN), "担当プロが担当します");
  assert.equal(redactNames("山田太郎", HIDDEN), "担当プロ");
});

test("姓＋敬称・姓だけ・名だけも伏せる", () => {
  assert.equal(redactNames("山田プロのレッスン", HIDDEN), "担当プロのレッスン");
  assert.equal(redactNames("山田コーチ／山田さん／山田先生", HIDDEN), "担当プロ／担当プロ／担当プロ");
  assert.equal(redactNames("今日は山田が入ります", HIDDEN), "今日は担当プロが入ります");
  assert.equal(redactNames("太郎に聞いてください", HIDDEN), "担当プロに聞いてください");
});

test("複数回・複数人でも全部伏せる", () => {
  const out = redactNames("山田さんと鈴木　花子、山田太郎の3名", ["山田　太郎", "鈴木　花子"]);
  assert.equal(out, "担当プロと担当プロ、担当プロの3名");
  assert.equal(containsHiddenName(out, ["山田　太郎", "鈴木　花子"]), false);
});

test("伏せる人がいなければ何もしない・他の人の名前は触らない", () => {
  assert.equal(redactNames("佐藤　一郎(9:00〜)", HIDDEN), "佐藤　一郎(9:00〜)");
  assert.equal(redactNames("山田　太郎", []), "山田　太郎");
  assert.equal(redactNames("", HIDDEN), "");
});

test("姓のみ登録（名が無い）でも動く。1文字の姓は単独では伏せない", () => {
  assert.deepEqual(nameVariants("森").includes("森"), false);
  assert.equal(redactNames("森プロ", ["森"]), "担当プロ");
  assert.equal(redactNames("森林公園", ["森"]), "森林公園");
});

test("置き換えた結果に名前が残らない（送信前の最後の砦）", () => {
  const text = "山田　太郎、山田プロ、山田、太郎";
  assert.equal(containsHiddenName(redactNames(text, HIDDEN), HIDDEN), false);
});
