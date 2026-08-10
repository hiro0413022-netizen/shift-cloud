import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INCIDENT_CATEGORIES,
  countByCategory,
  incidentCategoryLabel,
  normalizeIncidentCategory,
  normalizeSeverity,
  repeatedCategories,
  ruleBasedInsights,
} from "../packages/core/src/incidents.ts";

/**
 * イレギュラー報告（#125）の分類・集計を固定する。
 *
 * 一番こわい壊れ方は Vault の実障害（2026-08-07）と同じ「一覧に無いカテゴリの報告が
 * 画面から静かに消える」こと。報告は1件も落とさないことが価値なので、そこを固定する。
 */

test("未知のカテゴリでも必ずどれかに入る（報告が消えない）", () => {
  const rows = [
    { category: "customer" },
    { category: "クレーム" },        // 別名
    { category: "まったく知らない分類" },
    { category: "" },
    { category: null as unknown as string },
  ];
  const counted = countByCategory(rows);
  const total = counted.reduce((s, c) => s + c.count, 0);
  assert.equal(total, rows.length, "全件がどこかのカテゴリに入っていない＝報告が消えている");
});

test("別名は正規のキーへ寄る", () => {
  assert.equal(normalizeIncidentCategory("クレーム"), "customer");
  assert.equal(normalizeIncidentCategory("設備"), "equipment");
  assert.equal(normalizeIncidentCategory("レジ"), "payment");
  assert.equal(normalizeIncidentCategory("ケガ"), "injury");
  assert.equal(normalizeIncidentCategory("CUSTOMER"), "customer");
});

test("未知カテゴリは other に落ちる（ラベルも必ず返る）", () => {
  assert.equal(normalizeIncidentCategory("宇宙人が来た"), "other");
  assert.equal(incidentCategoryLabel("宇宙人が来た"), INCIDENT_CATEGORIES.other);
  assert.equal(incidentCategoryLabel(null), INCIDENT_CATEGORIES.other);
});

test("重大度: 不正値は mid に落ちる（high を勝手に作らない）", () => {
  assert.equal(normalizeSeverity("high"), "high");
  assert.equal(normalizeSeverity("HIGH"), "high");
  assert.equal(normalizeSeverity("緊急"), "mid");
  assert.equal(normalizeSeverity(null), "mid");
  assert.equal(normalizeSeverity(""), "mid");
});

test("カテゴリ別集計は多い順", () => {
  const rows = [
    { category: "equipment" },
    { category: "customer" },
    { category: "equipment" },
    { category: "equipment" },
    { category: "customer" },
  ];
  const counted = countByCategory(rows);
  assert.equal(counted[0].cat, "equipment");
  assert.equal(counted[0].count, 3);
  assert.equal(counted[1].count, 2);
});

test("2件以上を繰り返しとみなす", () => {
  const rows = [
    { category: "booking", occurred_at: "2026-08-01T10:00:00Z" },
    { category: "booking", occurred_at: "2026-08-05T10:00:00Z" },
    { category: "injury", occurred_at: "2026-08-06T10:00:00Z" },
  ];
  const rep = repeatedCategories(rows);
  assert.equal(rep.length, 1);
  assert.equal(rep[0].cat, "booking");
});

/** AIキーが無い環境でも「分析結果が空」にならないことを保証する */
test("ルールベース分析: AIが無くても繰り返しには必ず対策が出る", () => {
  const rows = [
    { id: "a", category: "booking", severity: "mid", occurred_at: "2026-08-01T01:00:00Z", place: "受付", involved: null, body: "ダブルブッキング", action_taken: null, status: "open", store_id: "s1" },
    { id: "b", category: "booking", severity: "high", occurred_at: "2026-08-03T01:00:00Z", place: "受付", involved: null, body: "予約の伝達もれ", action_taken: null, status: "open", store_id: "s1" },
    { id: "c", category: "payment", severity: "low", occurred_at: "2026-08-04T01:00:00Z", place: null, involved: null, body: "レジ違算", action_taken: null, status: "open", store_id: "s1" },
  ];
  const out = ruleBasedInsights(rows);
  assert.equal(out.length, 1, "2件以上あるカテゴリだけが対策になる");
  assert.equal(out[0].incident_ids.length, 2);
  assert.ok(out[0].prevention.length > 0, "再発防止策が空だと画面が無意味になる");
  assert.equal(out[0].store_id, "s1", "全件同じ店舗なら店舗を特定する");
});

test("ルールベース分析: 1件しかなければ対策は作らない（ノイズを出さない）", () => {
  const rows = [
    { id: "a", category: "booking", severity: "mid", occurred_at: "2026-08-01T01:00:00Z", place: null, involved: null, body: "x", action_taken: null, status: "open", store_id: null },
  ];
  assert.equal(ruleBasedInsights(rows).length, 0);
});
