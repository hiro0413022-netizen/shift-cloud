// 議事録の文字起こし処理（区間の時刻合わせ・話者名・根拠の照合）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  offsetTranscript, joinSegments, listSpeakers, applySpeakers, verifyQuote, normalizeForMatch,
  annotateSummary, countUnverified, collapseRepeats,
} from "../apps/minutes/src/lib/transcript.ts";
import { parseSummary, MODE_BY_ID } from "../apps/minutes/src/lib/modes.ts";

test("区間の相対時刻に開始秒を足す", () => {
  assert.equal(offsetTranscript("[01:05] 話者A: こんにちは", 600), "[00:11:05] 話者A: こんにちは");
  assert.equal(offsetTranscript("[1:00:00] 話者A: x", 60), "[01:01:00] 話者A: x");
  assert.equal(offsetTranscript("時刻なし", 600), "時刻なし");
});

test("欠けた区間は黙ってつながず、欠けていると書く", () => {
  const t = joinSegments([
    { idx: 1, transcript: "[00:10] 話者B: 後半", offsetSec: 600 },
    { idx: 0, transcript: "[00:05] 話者A: 前半", offsetSec: 0 },
    { idx: 2, transcript: null, offsetSec: 1200 },
  ]);
  assert.equal(t.split("\n")[0], "[00:00:05] 話者A: 前半");
  assert.equal(t.split("\n")[1], "[00:10:10] 話者B: 後半");
  assert.match(t.split("\n")[2], /文字起こしできませんでした/);
});

test("話者の一覧と置き換え（行頭のラベルだけ）", () => {
  const t = "[00:00:01] 話者A: 話者Bさんに聞きます\n[00:00:05] 話者B: はい";
  assert.deepEqual(listSpeakers(t), ["話者A", "話者B"]);
  const r = applySpeakers(t, { 話者A: "古川", 話者B: "山本" });
  assert.equal(r, "[00:00:01] 古川: 話者Bさんに聞きます\n[00:00:05] 山本: はい");
});

test("根拠の照合: 原文どおり / 少し違う / 作文", () => {
  const norm = normalizeForMatch(
    "[00:01:00] 話者A: では月額は１８，０００円でいきましょう。契約期間は1年でお願いします。\n[00:01:10] 話者B: 承知しました、金曜までに見積書をお送りします。"
  );
  assert.equal(verifyQuote("月額は18,000円でいきましょう", norm), "ok");
  assert.equal(verifyQuote("金曜までに見積書をお送りしますね", norm), "near");
  assert.equal(verifyQuote("来月から値引きを検討する", norm), "none");
  assert.equal(verifyQuote("", norm), "none");
});

test("要約の全項目に照合結果が付き、見つからない数を数えられる", () => {
  const s = parseSummary(
    {
      decisions: [{ text: "x", q: "月額は18,000円" }],
      todos: [{ task: "y", owner: "", due: "", q: "存在しない発言をでっちあげ" }],
      sections: { topics: [{ text: "z", q: "契約期間は1年" }] },
    },
    MODE_BY_ID.general
  );
  const a = annotateSummary(s, "話者A: 月額は18,000円です。契約期間は1年です。");
  assert.equal(a.decisions[0].check, "ok");
  assert.equal(a.todos[0].check, "none");
  assert.equal(a.sections.topics[0].check, "ok");
  assert.equal(countUnverified(a), 1);
});

test("同じ行の繰り返しを畳む", () => {
  const t = ["[00:01] A: はい", "[00:02] A: はい", "[00:03] A: はい", "[00:04] A: はい", "[00:05] A: 次"].join("\n");
  const r = collapseRepeats(t).split("\n");
  assert.equal(r.length, 4);
  assert.match(r[2], /省略/);
  assert.equal(r[3], "[00:05] A: 次");
});
