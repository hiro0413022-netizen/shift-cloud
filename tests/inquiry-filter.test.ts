// LINE受信フィルタ（リッチメニューの定型文）の当たり判定（#255）
import test from "node:test";
import assert from "node:assert/strict";
import { findFilterRule, ruleMatches, normalizeFilterText } from "../apps/genesis/src/lib/inquiry-filter.ts";

const rules = [
  { id: "pro", source: "line", pattern: "プロの出勤情報", match_type: "exact", action: "noise", active: true },
  { id: "ask", source: "line", pattern: "お問い合わせを希望します", match_type: "exact", action: "noise", active: true },
  { id: "compe", source: "any", pattern: "親睦コンペ", match_type: "contains", action: "low", active: true },
  { id: "off", source: "line", pattern: "料金", match_type: "prefix", action: "noise", active: false },
  { id: "mail", source: "gmail", pattern: "配信停止", match_type: "contains", action: "noise", active: true },
];

test("リッチメニューの定型文は noise", () => {
  assert.equal(findFilterRule(rules, "line", "プロの出勤情報")?.id, "pro");
  assert.equal(findFilterRule(rules, "line", "  お問い合わせを希望します\n")?.id, "ask");
});

test("完全一致は、お客様が続けて書いた文には当たらない", () => {
  assert.equal(findFilterRule(rules, "line", "プロの出勤情報を教えてください。明日は誰がいますか"), null);
  assert.equal(findFilterRule(rules, "line", "お問い合わせを希望します。入会金について"), null);
});

test("全角・半角・空白の違いを吸収", () => {
  assert.equal(normalizeFilterText("ＡＢＣ　１２３\n"), "ABC 123");
  assert.equal(ruleMatches({ pattern: "第10回親睦コンペ", match_type: "exact" }, "第１０回親睦コンペ"), true);
});

test("source・無効ルール・優先順位", () => {
  assert.equal(findFilterRule(rules, "line", "第10回親睦コンペ")?.id, "compe"); // any は line にも効く
  assert.equal(findFilterRule(rules, "line", "料金を知りたい"), null); // 無効ルールは見ない
  assert.equal(findFilterRule(rules, "line", "配信停止"), null); // gmail 用は line に効かない
  assert.equal(findFilterRule(rules, "gmail", "配信停止のお願い")?.id, "mail");
  const both = [
    { id: "low", source: "line", pattern: "出勤", match_type: "contains", action: "low" },
    { id: "noise", source: "line", pattern: "プロの出勤情報", match_type: "exact", action: "noise" },
  ];
  assert.equal(findFilterRule(both, "line", "プロの出勤情報")?.id, "noise"); // noise を優先
  assert.equal(findFilterRule(rules, "line", ""), null);
});
