// ナレッジ候補の判定（音声メモ → 候補 → 昇格）のテスト
//
// 守りたいのは2つ:
//   1. 候補の寄せ先を **AIではなくあいまい一致で** 決めていること
//      （AIに既存IDを選ばせると、無いIDを作って返してくる）
//   2. 昇格の門が **回数（別々の日）** であること
//      AIの自己採点を門にすると、自分の答案を自分で採点することになる
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  placeCandidate, makeDigest, shouldQueue, PROMOTE_HITS,
  type SymptomLite, type CheckpointLite,
} from "../apps/swing-cortex/src/lib/candidates.ts";

// 本番マスタから抜粋（GOLF WING / 津の実データに近い形）
const SYMPTOMS: SymptomLite[] = [
  { id: "s1", name: "伸び上がり（前傾角の起き上がり）", tags: ["起き上がる", "手元が浮く"] },
  { id: "s2", name: "アーリーリリース（タメがほどける）", tags: ["キャスティング", "タメがない"] },
  { id: "s3", name: "シャンク", tags: ["ネックに当たる"] },
];
const CHECKPOINTS: CheckpointLite[] = [
  { id: "c1", symptomId: "s1", title: "前傾キープ" },
  { id: "c2", symptomId: "s2", title: "右手首の角度を保つ" },
];

test("既存の症状に寄せられる候補は append になる", () => {
  const placed = placeCandidate(
    { title: "伸び上がりを抑える", cause: "インパクトで前傾がほどける", fix: "股関節を残したまま回す" },
    SYMPTOMS,
    CHECKPOINTS
  );
  assert.ok(placed);
  assert.equal(placed.kind, "append");
  assert.equal(placed.symptomId, "s1");
});

test("同じ確認項目がすでにあるときは、その確認項目に紐づく", () => {
  const placed = placeCandidate(
    { title: "前傾キープ", cause: "起き上がる", fix: "左肩を下げて前傾を保つ", drill: "ベタ足ドリル" },
    SYMPTOMS,
    CHECKPOINTS
  );
  assert.ok(placed);
  assert.equal(placed.kind, "append");
  assert.equal(placed.symptomId, "s1");
  assert.equal(placed.checkpointId, "c1");
});

test("どの症状にも寄せられないものは new_symptom（いちばん慎重に扱う）", () => {
  const placed = placeCandidate(
    { title: "バンカーの砂の取り方", cause: "エクスプロージョンができていない", fix: "砂を薄く長く取る" },
    SYMPTOMS,
    CHECKPOINTS
  );
  assert.ok(placed);
  assert.equal(placed.kind, "new_symptom");
  assert.equal(placed.symptomId, null);
  assert.equal(placed.proposed.name, "バンカーの砂の取り方");
});

test("見出しか対処が空の候補は捨てる（AIが空を返すことがある）", () => {
  assert.equal(placeCandidate({ title: "", cause: "x", fix: "y" }, SYMPTOMS, CHECKPOINTS), null);
  assert.equal(placeCandidate({ title: "x", cause: "y", fix: "  " }, SYMPTOMS, CHECKPOINTS), null);
});

test("同じ趣旨は同じ指紋になる（行を増やさず回数を数えるため）", () => {
  const a = makeDigest({ kind: "append", symptomId: "s1", checkpointId: "c1", title: "前傾キープ", fix: "股関節を残す" });
  const b = makeDigest({ kind: "append", symptomId: "s1", checkpointId: "c1", title: "前傾 キープ", fix: "股関節を残す" });
  assert.equal(a, b);
});

test("寄せ先が違えば別の候補として数える", () => {
  const a = makeDigest({ kind: "append", symptomId: "s1", checkpointId: "c1", title: "前傾キープ", fix: "股関節を残す" });
  const b = makeDigest({ kind: "append", symptomId: "s2", checkpointId: "c2", title: "前傾キープ", fix: "股関節を残す" });
  assert.notEqual(a, b);
});

test("昇格は『別々の日に3回以上』のときだけ", () => {
  // 1回では出さない
  assert.equal(shouldQueue({ hits: 1, firstSeenOn: "2026-09-01", lastSeenOn: "2026-09-01", status: "collected" }), false);
  // 回数が足りていても同じ日だけなら出さない（1回のレッスンで門を通ってしまう）
  assert.equal(
    shouldQueue({ hits: PROMOTE_HITS, firstSeenOn: "2026-09-01", lastSeenOn: "2026-09-01", status: "collected" }),
    false
  );
  // 別々の日に3回でようやく出す
  assert.equal(
    shouldQueue({ hits: PROMOTE_HITS, firstSeenOn: "2026-09-01", lastSeenOn: "2026-09-05", status: "collected" }),
    true
  );
  // すでに出したもの・採用済み・見送り済みは対象外
  for (const status of ["queued", "adopted", "rejected"]) {
    assert.equal(shouldQueue({ hits: 9, firstSeenOn: "2026-09-01", lastSeenOn: "2026-09-05", status }), false);
  }
});
