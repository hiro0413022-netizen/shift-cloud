// 売上の区分（「何を売りましたか」）の選択肢と表記ゆれ寄せ（#331・2026-10-02）。実行: npm test
// 「月会費」で入ると月会費予測が止まって売上から約370万円消える（2026-09-29の実障害）ので、
// 寄せの式はテストで固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SALES_CATEGORIES,
  SALES_CATEGORY_HINTS,
  normalizeSalesCategory,
} from "../apps/money-golfwing/src/lib/sales-category.ts";

test("工賃と参加料が選択肢に入っている", () => {
  assert.ok(SALES_CATEGORIES.includes("工賃"));
  assert.ok(SALES_CATEGORIES.includes("参加料"));
});

test("もとの4つは消えていない", () => {
  for (const c of ["利用料", "月会費(窓口)", "販売", "その他"]) {
    assert.ok(SALES_CATEGORIES.includes(c), c);
  }
});

test("「月会費」は必ず「月会費(窓口)」へ寄せる", () => {
  assert.equal(normalizeSalesCategory("月会費"), "月会費(窓口)");
  assert.equal(normalizeSalesCategory(" 月会費 "), "月会費(窓口)");
});

test("「参加費」は「参加料」へ寄せる（過去台帳の表記ゆれ）", () => {
  assert.equal(normalizeSalesCategory("参加費"), "参加料");
});

test("それ以外はそのまま（前後の空白だけ落とす）", () => {
  assert.equal(normalizeSalesCategory("工賃"), "工賃");
  assert.equal(normalizeSalesCategory(" 販売"), "販売");
  assert.equal(normalizeSalesCategory(""), "");
});

test("新しく足した区分には但し書きがある", () => {
  assert.ok(SALES_CATEGORY_HINTS["工賃"]);
  assert.ok(SALES_CATEGORY_HINTS["参加料"]);
});
