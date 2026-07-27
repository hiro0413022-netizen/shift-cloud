// SWING CORTEX 症状検索（あいまい一致）のテスト
// 「伸びあがり / 伸びあがる / 伸び上がる」のような表記ゆれ・活用違いで同じ症状に着地することを担保する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { similarity, normalize, stem } from "../apps/swing-cortex/src/lib/jp-search.ts";
import { matchSymptoms, type DiagnosisResult } from "../apps/swing-cortex/src/lib/coaching.ts";

const sym = (
  symptomName: string,
  category: string,
  tags: string[],
  checkpoints: DiagnosisResult["checkpoints"] = []
): DiagnosisResult => ({
  symptomId: symptomName,
  symptomName,
  category,
  tags,
  flightDir: null,
  checkpoints,
});

// 本番マスタから抜粋（sc_symptoms）
const TREE: DiagnosisResult[] = [
  sym("インパクトの伸び上がり", "体の動き", ["起き上がる", "緩む", "手元浮く"], [
    { priority: 1, title: "前傾キープ", cause: "インパクトで前傾がほどける", fix: "股関節を残す", drill: "ベタ足ドリル", client: "" },
  ]),
  sym("スライス", "A. 球筋・ミス", ["右に曲がる", "こすり球", "カット", "アウトサイドイン", "フェースが開く"]),
  sym("フック/チーピン", "A. 球筋・ミス", ["左に曲がる", "巻く", "被る", "インサイドアウト", "つかまりすぎ"]),
  sym("捻転不足（腕引きのテイクバック）", "体の動き", ["回らない", "浅い", "腕で上げる", "軸回転"]),
  sym("アドレス姿勢の不良", "B. アドレス・準備", ["猫背", "前傾が浅い", "構え", "重心が高い"]),
  sym("スウェー・軸のずれ", "体の動き", ["右にずれる", "流れる", "突っ込み", "スライド"]),
  sym("ダフリ", "A. 球筋・ミス", ["手前を叩く", "ザックリ", "地面"]),
  sym("シャンク", "A. 球筋・ミス", ["ネックに当たる", "右前へ飛ぶ"]),
  sym("飛距離不足", "A. 球筋・ミス", ["飛ばない", "飛ばしたい"]),
  sym("パターが安定しない", "E. クラブ・状況別", ["方向", "距離感", "ストローク", "3パット"]),
];

const top = (q: string) => matchSymptoms(q, TREE)[0]?.symptomName;
const names = (q: string) => matchSymptoms(q, TREE).map((s) => s.symptomName);

test("normalize: カタカナ・漢字・記号のゆれを同じ形に寄せる", () => {
  assert.equal(normalize("伸び上がり"), normalize("伸びあがり"));
  assert.equal(normalize("伸び上がり"), normalize("ノビアガリ"));
  assert.equal(normalize("突っ込み"), normalize("突込み"));
  assert.equal(normalize("引っかけ"), normalize("引っ掛け"));
  assert.equal(normalize("猫背"), normalize("ねこぜ"));
});

test("stem: 活用語尾を落として語幹に寄せる", () => {
  assert.equal(stem(normalize("伸びあがる")), stem(normalize("伸びあがり")));
  assert.equal(stem(normalize("回らない")), stem(normalize("回る")));
});

test("similarity: 活用・送り仮名違いは高スコア、無関係は0", () => {
  assert.ok(similarity("伸びあがる", "伸び上がり") >= 0.6);
  assert.ok(similarity("のびあがり", "インパクトの伸び上がり") >= 0.6);
  assert.equal(similarity("スライス", "シャンク"), 0);
  assert.equal(similarity("パター", "ダフリ"), 0);
});

test("あいまい検索: 伸びあがり系はどの言い方でも同じ症状に着地する", () => {
  for (const q of ["伸びあがり", "伸びあがる", "伸び上がる", "のびあがり", "ノビアガリ", "起き上がる", "インパクトで伸びあがってしまう"]) {
    assert.equal(top(q), "インパクトの伸び上がり", `クエリ「${q}」`);
  }
});

test("あいまい検索: 話し言葉・活用形でも当たる", () => {
  assert.equal(top("右に曲がる"), "スライス");
  assert.equal(top("右にまがってしまいます"), "スライス");
  assert.equal(top("こすり球"), "スライス");
  assert.equal(top("左に曲がった"), "フック/チーピン");
  assert.equal(top("回らない"), "捻転不足（腕引きのテイクバック）");
  assert.equal(top("ねこぜ"), "アドレス姿勢の不良");
  assert.equal(top("とばない"), "飛距離不足");
  assert.equal(top("3パット多い"), "パターが安定しない");
});

test("あいまい検索: 症状名そのもの・部分入力でも当たる", () => {
  assert.equal(top("スライス"), "スライス");
  assert.equal(top("すらいす"), "スライス");
  assert.equal(top("シャンク"), "シャンク");
  assert.ok(names("ダフる").includes("ダフリ"));
});

test("あいまい検索: 無関係な語で誤爆しない", () => {
  assert.ok(!names("シャンク").includes("パターが安定しない"));
  assert.equal(matchSymptoms("", TREE).length, 0);
  // 長音を消すと「コース」→「こす」で「こすり球」と衝突する（normalizeでーを残している理由）
  assert.equal(similarity("こすってる", "コースでOB"), 0);
  // 短い語幹が長い語にたまたま含まれるだけでは当てない（「はや」⊂「はやほどけ」）
  assert.equal(similarity("早ほどけ", "速い"), 0);
});

test("あいまい検索: 名詞形/動詞形どちらでも当たる", () => {
  assert.ok(names("引っ掛かる").includes("フック/チーピン"));
  assert.ok(names("ダフる").includes("ダフリ"));
  assert.ok(names("スエー").includes("スウェー・軸のずれ"));
});
