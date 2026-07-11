// 科目推測ルールのテスト（Money OS 暫定ルール。誤分類は月次PL→人件費率KPIへ波及するためルールを固定）
import { test } from "node:test";
import assert from "node:assert/strict";
import { proposeCategory, isCardSettlement } from "../apps/money-golfwing/src/lib/import/categorize.ts";

test("proposeCategory: 代表パターン", () => {
  assert.equal(proposeCategory("ENEOS 宝塚SS"), "utility");
  assert.equal(proposeCategory("GOOGLE ADS"), "ad");
  assert.equal(proposeCategory("ﾔﾁﾝ 6ﾂｷﾌﾞﾝ"), "rent");
  assert.equal(proposeCategory("コーナン 宝塚店"), "supplies");
  assert.equal(proposeCategory("Vercel Inc"), "outsourcing");
  assert.equal(proposeCategory("ﾃｽｳﾘﾖｳ"), "other_expense");
});

test("proposeCategory: 振込の個人/法人判定（誤ると人件費KPIが歪む）", () => {
  assert.equal(proposeCategory("IBﾌﾘｺﾐ ﾔﾏﾀﾞ ﾀﾛｳ"), "labor"); // 個人宛→人件費
  assert.equal(proposeCategory("IBﾌﾘｺﾐ ｶ)ﾔﾏﾀﾞｺｳﾑﾃﾝ"), "outsourcing"); // 法人マーカー→外注
  assert.equal(proposeCategory("振込 株式会社サンプル"), "outsourcing");
});

test("proposeCategory: 不明は other_expense（勝手にlabor等へ倒さない）", () => {
  assert.equal(proposeCategory("ﾅｿﾞﾉﾒｲｻｲ XYZ"), "other_expense");
  assert.equal(proposeCategory(""), "other_expense");
});

test("isCardSettlement: カード引落は経費二重計上防止でignore初期値", () => {
  assert.equal(isCardSettlement("ｱﾒﾘｶﾝ ｴｷｽﾌﾟﾚｽ"), true);
  assert.equal(isCardSettlement("AMERICAN EXPRESS"), true);
  assert.equal(isCardSettlement("ENEOS"), false);
});
