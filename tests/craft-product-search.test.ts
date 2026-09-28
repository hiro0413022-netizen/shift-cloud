// craft-os 商品マスタ検索（2026-09-28「reve で探してもリボルバーしか出てこない」）
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchWords, rankProducts, matchesAll, toFullWidth } from "../apps/craft-os/src/lib/product-search.ts";

const P = (manufacturer: string, name: string, spec: string | null = null) => ({ manufacturer, name, spec });
const ROWS = [
  P("REVE", "IMPACT BORON REVOLVER R（色確認）"),
  P("REVE", "BREAKOUT FW 1FLEX"),
  P("REVE", "REVER ASSAULT ATTACK 50S（色確認）"),
  P("REVE", "REVER ARMORED READY UT 60S（色確認）"),
  P("Fujikura", "VENTUS BLUE", "6S"),
];

test("全角で打っても半角と同じ言葉になる", () => {
  assert.deepEqual(searchWords("ｒｅｖｅ"), ["reve"]);
  assert.deepEqual(searchWords("ＲＥＶＥ　５０Ｓ"), ["reve", "50s"]);
  assert.deepEqual(searchWords("a,b(c)"), ["a", "b", "c"]);
});

test("reve: 名前に REVE を含む REVER が、メーカー名だけで当たる REVOLVER より上", () => {
  const r = rankProducts(ROWS, searchWords("reve")).map((p) => p.name);
  assert.equal(r.length, 4);
  assert.ok(r[0].startsWith("REVER"));
  assert.ok(r[1].startsWith("REVER"));
  assert.ok(r.indexOf("IMPACT BORON REVOLVER R（色確認）") > 1);
});

test("複数の言葉はすべて含むもの（メーカー＋硬さ・スペック欄も見る）", () => {
  assert.deepEqual(rankProducts(ROWS, searchWords("reve 50s")).map((p) => p.name), ["REVER ASSAULT ATTACK 50S（色確認）"]);
  assert.deepEqual(rankProducts(ROWS, searchWords("ventus 6s")).map((p) => p.name), ["VENTUS BLUE"]);
  assert.equal(matchesAll(P("ＲＥＶＥ", "ＲＥＶＥＲ"), ["rever"]), true);
});

test("全角への変換（全角で登録された行に DB で当てる用）", () => {
  assert.equal(toFullWidth("reve5"), "ｒｅｖｅ５");
});
