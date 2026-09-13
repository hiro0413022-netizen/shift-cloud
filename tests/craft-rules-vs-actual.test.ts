// DBに入れた割引ルール（golfwing.discount_rules）が、実際の売上と合っているかを確かめる。
// fixture は 2026-09-12 時点の discount_rules をそのまま写したもの。
// DB のルールを変えたら、この fixture も更新すること（変えたつもりのない変更に気づくための歯止め）。
//
// 突き合わせ元: mon_sales_lines（2024-01-01 以降の実売上）を集計した「掛け率 × 件数」。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveDiscount, type DiscountRule, type MemberKind, type Segment } from "../packages/core/src/fitting-quote.ts";

const RULES = JSON.parse(
  readFileSync(new URL("./fixtures/craft-discount-rules.json", import.meta.url), "utf8"),
) as DiscountRule[];

const at = { onDate: "2026-09-12" };
const rate = (itemCategory: string, manufacturer: string | null, memberKind: MemberKind, segment: Segment) =>
  resolveDiscount(RULES, { itemCategory, manufacturer, memberKind, segment, ...at }).rate;

test("fixture が空でない（DBからの写し忘れ検知）", () => {
  assert.ok(RULES.length >= 30, `ルール ${RULES.length} 件しかない`);
});

test("グリップ: 実績どおり 会員0.90 / ビジター1.00（実売上 266件 / 108件）", () => {
  assert.equal(rate("グリップ", "iomic", "会員", "member_paid_fitting"), 0.9);
  assert.equal(rate("グリップ", "iomic", "ビジター", "visitor_no_fitting"), 1.0);
  assert.equal(rate("グリップ", "ゴルフプライド", "会員", "visitor_or_intro"), 0.9);
});

test("シャフト: 実績の三本柱 0.80 / 0.70 / 0.90 を再現する（実売上 126件 / 38件 / 20件）", () => {
  assert.equal(rate("シャフト", "フジクラ", "ビジター", "visitor_or_intro"), 0.8);
  assert.equal(rate("シャフト", "フジクラ", "会員", "member_paid_fitting"), 0.7);
  assert.equal(rate("シャフト", "フジクラ", "会員", "from_demo_or_lesson"), 0.9);
  // 会員でも「再フィッティング」区分なら 0.80（実績で会員の0.80が19件あることの説明）
  assert.equal(rate("シャフト", "三菱ケミカル", "会員", "visitor_or_intro"), 0.8);
});

test("シャフト: REVEは5%低い（実績 0.85が7件・0.75が1件）", () => {
  assert.equal(rate("シャフト", "REVE", "ビジター", "visitor_or_intro"), 0.85);
  assert.equal(rate("シャフト", "REVE", "会員", "member_paid_fitting"), 0.75);
});

test("ボール: タイトリストだけ1.00、ブリヂストンは会員0.90（実績19件）", () => {
  assert.equal(rate("ボール", "タイトリスト", "会員", "member_paid_fitting"), 1.0);
  assert.equal(rate("ボール", "タイトリスト", "ビジター", "visitor_no_fitting"), 1.0);
  assert.equal(rate("ボール", "ブリヂストン", "会員", "member_paid_fitting"), 0.9);
  assert.equal(rate("ボール", "ブリヂストン", "ビジター", "visitor_no_fitting"), 1.0);
});

test("クラブ: 会員0.85（実績10件）／一見のビジター1.00（実績9件）", () => {
  assert.equal(rate("クラブ", "PING", "会員", "member_paid_fitting"), 0.85);
  assert.equal(rate("クラブ", "PING", "ビジター", "visitor_no_fitting"), 1.0);
  assert.equal(rate("クラブ", "PING", "ビジター", "visitor_or_intro"), 0.8);
});

test("同じ条件を何度引いても同じ率になる（画面ごとに割れない）", () => {
  const combos: [string, string | null, MemberKind, Segment][] = [
    ["シャフト", "グラファイトデザイン", "会員", "member_paid_fitting"],
    ["クラブ", "タイトリスト", "会員", "visitor_or_intro"],
    ["グリップ", null, "ビジター", "visitor_no_fitting"],
    ["ボール", "タイトリスト", "会員", "from_demo_or_lesson"],
  ];
  for (const c of combos) {
    const first = rate(...c);
    for (let i = 0; i < 20; i += 1) assert.equal(rate(...c), first);
  }
});

test("ルール表にあるどの率も 0 より大きく 1 以下（値引きで金額が増えない）", () => {
  for (const r of RULES) {
    const v = Number(r.rate);
    assert.ok(v > 0 && v <= 1, `${r.item_category} ${r.manufacturer ?? ""} の率が範囲外: ${v}`);
  }
});
