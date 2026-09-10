// コンペのスコア計算（ペリア／ダブルペリア・順位）の回帰テスト。実行: npm test
// DECISIONS #232 — 式を変えたらここが落ちる。過去の表彰結果と食い違わせないための固定。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildScoreRows,
  calcGross,
  calcPeriaHcp,
  declaredHcp,
  formatNet,
  isPeria,
  PERIA_HOLES_DOUBLE,
  PERIA_HOLES_SINGLE,
  sumHoles,
} from "../packages/core/src/compe-score.ts";

/** 全18ホールに同じ打数を入れたスコアを作る */
const flat = (n: number) => {
  const holes: Record<string, number> = {};
  for (let h = 1; h <= 18; h += 1) holes[`h${h}`] = n;
  return { holes };
};

test("GROSS: 直接入力がホール合計より優先される", () => {
  assert.equal(sumHoles(flat(5)), 90);
  assert.equal(calcGross(flat(5)), 90);
  assert.equal(calcGross({ ...flat(5), direct_gross: 88 }), 88);
  // 未入力ホールは0扱いにしない（9ホールだけ入力＝その合計）
  assert.equal(calcGross({ holes: { h1: 4, h2: 5, h3: 4 } }), 13);
  assert.equal(calcGross(undefined), 0);
});

test("シンペリア: (隠し6穴×3 − 72) × 0.8", () => {
  // 隠し6穴すべて5打 → (30×3 − 72) × 0.8 = 14.4
  const holes: Record<string, number> = {};
  for (const h of PERIA_HOLES_SINGLE.slice(0, 6)) holes[`h${h}`] = 5;
  assert.equal(calcPeriaHcp({ holes }, "peria_single"), 14.4);
});

test("ダブルペリア: (隠し12穴×1.5 − 72) × 0.8", () => {
  // 隠し12穴すべて5打 → (60×1.5 − 72) × 0.8 = 14.4
  const holes: Record<string, number> = {};
  for (const h of PERIA_HOLES_DOUBLE) holes[`h${h}`] = 5;
  assert.equal(calcPeriaHcp({ holes }, "peria_double"), 14.4);
});

test("ダブルペリア(上限36): 36で頭打ち・下限は0", () => {
  // 隠し12穴すべて8打 → (96×1.5 − 72) × 0.8 = 57.6 → 上限36
  const big: Record<string, number> = {};
  for (const h of PERIA_HOLES_DOUBLE) big[`h${h}`] = 8;
  assert.equal(calcPeriaHcp({ holes: big }, "peria_double36"), 36);
  assert.equal(calcPeriaHcp({ holes: big }, "peria_double"), 57.6);

  // 隠し12穴すべて3打 → (54 − 72) × 0.8 = マイナス → 0
  const small: Record<string, number> = {};
  for (const h of PERIA_HOLES_DOUBLE) small[`h${h}`] = 3;
  assert.equal(calcPeriaHcp({ holes: small }, "peria_double36"), 0);
});

test("隠しホールが未入力ならHCPは0（スコアなしの人がNETで上位に来ない）", () => {
  assert.equal(calcPeriaHcp({ holes: {} }, "peria_double"), 0);
  assert.equal(calcPeriaHcp(undefined, "peria_double36"), 0);
});

test("isPeria / declaredHcp", () => {
  assert.equal(isPeria("peria_double36"), true);
  assert.equal(isPeria("stroke"), false);
  assert.equal(declaredHcp({ id: "a", name: "A", hcp: "18.6" }), 18.6);
  assert.equal(declaredHcp({ id: "a", name: "A", hcp: null }), 0);
  assert.equal(declaredHcp({ id: "a", name: "A", hcp: "" }), 0);
});

test("順位: ストロークはNET昇順・スコア未入力は別枠", () => {
  const players = [
    { id: "p1", name: "田中", hcp: 19 },
    { id: "p2", name: "木原", hcp: 7 },
    { id: "p3", name: "未入力", hcp: 10 },
  ];
  const { ranked, noScore } = buildScoreRows(
    players,
    { p1: { direct_gross: 100 }, p2: { direct_gross: 85 } },
    "stroke"
  );
  // 木原 85−7=78 / 田中 100−19=81 → NETの小さい木原が1位
  assert.deepEqual(
    ranked.map((r) => [r.player.name, r.net, r.rank]),
    [
      ["木原", 78, 1],
      ["田中", 81, 2],
    ]
  );
  assert.equal(noScore.length, 1);
  assert.equal(noScore[0].player.name, "未入力");
  assert.equal(noScore[0].net, null);
});

test("同点は同順位にして tied を立てる（先に登録した人が自動で優勝にならない）", () => {
  const players = [
    { id: "p1", name: "先に登録", hcp: 10 },
    { id: "p2", name: "後で登録", hcp: 10 },
    { id: "p3", name: "3人目", hcp: 0 },
  ];
  const { ranked } = buildScoreRows(
    players,
    { p1: { direct_gross: 90 }, p2: { direct_gross: 90 }, p3: { direct_gross: 95 } },
    "stroke"
  );
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].rank, 1);
  assert.equal(ranked[0].tied, true);
  assert.equal(ranked[1].tied, true);
  // 同順位が2人いたら次は3位（1,1,3）
  assert.equal(ranked[2].rank, 3);
  assert.equal(ranked[2].tied, false);
});

test("ペリア競技では申告HCPを使わない（第9回コンペの形式）", () => {
  const holes: Record<string, number> = {};
  for (const h of PERIA_HOLES_DOUBLE) holes[`h${h}`] = 5;
  for (let h = 1; h <= 18; h += 1) if (!(`h${h}` in holes)) holes[`h${h}`] = 5;
  const { ranked } = buildScoreRows(
    [{ id: "p1", name: "高砂", hcp: 18.6 }],
    { p1: { holes } },
    "peria_double36"
  );
  // GROSS 90 − ペリアHCP 14.4 = 75.6（申告18.6は無視）
  assert.equal(ranked[0].gross, 90);
  assert.equal(ranked[0].hcp, 14.4);
  assert.equal(formatNet(ranked[0].net), "75.6");
});
