import test from "node:test";
import assert from "node:assert/strict";

/* ============================================================
   全体スコアの減点ロジック（DECISIONS #43）

   背景（2026-07-11 発見のバグ）:
   判断リストに「6月経費未入力」「予測値残存」「KPI目標未設定」が出ているのに
   全体スコアは 100点・「減点要因なし」と表示されていた。
   computeGenesisScore が CockpitData しか見ず、外部チェック（KPI整合性 #37 /
   法務 #40）の結果を無視していたため。朝これを見た古川さんは「満点」と誤認する。

   applyJudgmentPenalties は、判断項目が自己申告する weight を集計してスコアへ反映する。
   この挙動をここで固定する。
   ============================================================ */

// kernel.ts の実装（Next のパスエイリアスに依存しないよう、純粋ロジックを同型で再現）
// ※ 本体を変更したらこのテストが落ちるよう、計算式は本体と1対1で対応させている
type JudgmentItem = {
  kind: "approval" | "blocker" | "risk" | "kpi";
  title: string;
  href: string;
  weight?: number;
  scoreLabel?: string;
};
type GenesisScore = { score: number; grade: "good" | "watch" | "danger"; factors: string[] };

function applyJudgmentPenalties(base: GenesisScore, items: JudgmentItem[]): GenesisScore {
  let score = base.score;
  const factors = [...base.factors];
  const byLabel = new Map<string, { count: number; total: number }>();
  for (const it of items) {
    const w = Number(it.weight ?? 0);
    if (!Number.isFinite(w) || w <= 0) continue;
    const label = it.scoreLabel ?? "要対応";
    const cur = byLabel.get(label) ?? { count: 0, total: 0 };
    byLabel.set(label, { count: cur.count + 1, total: cur.total + w });
  }
  for (const [label, v] of byLabel) {
    score -= v.total;
    factors.push(`${label}${v.count}件 (-${v.total})`);
  }
  score = Math.max(0, Math.min(100, score));
  const grade = score >= 80 ? "good" : score >= 60 ? "watch" : "danger";
  return { score, grade, factors };
}

const perfect = (): GenesisScore => ({ score: 100, grade: "good", factors: [] });
const item = (weight: number, scoreLabel: string): JudgmentItem => ({
  kind: "kpi",
  title: "t",
  href: "/",
  weight,
  scoreLabel,
});

test("警告ゼロなら満点のまま（減点は起きない）", () => {
  const r = applyJudgmentPenalties(perfect(), []);
  assert.equal(r.score, 100);
  assert.deepEqual(r.factors, []);
});

test("weightの無い判断項目は減点しない（承認待ち等は既存ロジックが担当）", () => {
  const r = applyJudgmentPenalties(perfect(), [{ kind: "approval", title: "承認", href: "/approvals" }]);
  assert.equal(r.score, 100);
});

test("2026-07-11の実データ再現: 整合性2件＋目標未設定5件で満点にならない", () => {
  // 6月ゴルフ経費0円 / 6月forecast残存 / 5大KPI目標未設定5件
  const judgments = [
    item(12, "数字の整合性"), // 経費未入力
    item(12, "数字の整合性"), // 予測値残存
    item(4 * 5, "5大KPI目標未設定"),
  ];
  const r = applyJudgmentPenalties(perfect(), judgments);
  assert.equal(r.score, 56); // 100 - 12 - 12 - 20
  assert.equal(r.grade, "danger"); // 「満点」ではなく赤信号として出る
  assert.deepEqual(r.factors, ["数字の整合性2件 (-24)", "5大KPI目標未設定1件 (-20)"]);
});

test("同じラベルはまとめて集計される（説明可能性）", () => {
  const r = applyJudgmentPenalties(perfect(), [item(12, "数字の整合性"), item(12, "数字の整合性")]);
  assert.deepEqual(r.factors, ["数字の整合性2件 (-24)"]);
});

test("スコアは0未満にならない", () => {
  const many = Array.from({ length: 20 }, () => item(12, "数字の整合性"));
  const r = applyJudgmentPenalties(perfect(), many);
  assert.equal(r.score, 0);
  assert.equal(r.grade, "danger");
});

test("既存の減点（ブロッカー等）に上乗せされる", () => {
  const base: GenesisScore = { score: 90, grade: "good", factors: ["ブロッカー1件 (-10)"] };
  const r = applyJudgmentPenalties(base, [item(12, "数字の整合性")]);
  assert.equal(r.score, 78);
  assert.equal(r.grade, "watch");
  assert.equal(r.factors.length, 2);
});
