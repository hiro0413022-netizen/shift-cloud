// 議事録の要約モード（2026-09-27）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MODE_BY_ID, modesForLevel, modeAllowed, parseSummary, parseClassify, summaryToText, summarySystem,
} from "../apps/minutes/src/lib/modes.ts";

test("弁護士モードは L3 でしか選べない", () => {
  assert.equal(modeAllowed("lawyer", "L1"), false);
  assert.equal(modeAllowed("lawyer", "L2"), false);
  assert.equal(modeAllowed("lawyer", "L3"), true);
  assert.ok(!modesForLevel("L2").some((m) => m.id === "lawyer"));
});

test("AIが勝手に足した欄は捨て、型が崩れていても落ちない", () => {
  const mode = MODE_BY_ID.contract;
  const s = parseSummary(
    {
      title: "A社 契約条件",
      decisions: [{ text: "月額18,000円で合意", q: "月18,000円でいきましょう" }, "文字列だけの項目", { q: "本文なし" }],
      todos: [{ task: "見積書を送る", owner: "古川", due: "金曜", q: "金曜までに見積出します" }, { owner: "x" }],
      sections: { terms: [{ text: "期間12か月", q: "1年契約で" }], hacked: [{ text: "x", q: "y" }] },
    },
    mode
  );
  assert.equal(s.decisions.length, 2);
  assert.equal(s.todos.length, 1);
  assert.deepEqual(Object.keys(s.sections).sort(), ["not_agreed", "our_promises", "terms", "their_requests"]);
  assert.equal(s.sections.terms[0].text, "期間12か月");
  assert.equal("hacked" in s.sections, false);
});

test("parseSummary は null でも空の要約を返す", () => {
  const s = parseSummary(null, MODE_BY_ID.general);
  assert.equal(s.decisions.length, 0);
  assert.deepEqual(s.sections.topics, []);
});

test("モード判定は候補外を general に落とす（弁護士モードを勝手に選ばせない）", () => {
  const cands = modesForLevel("L1");
  assert.equal(parseClassify({ mode: "lawyer" }, cands), "general");
  assert.equal(parseClassify({ mode: "dev" }, cands), "dev");
  assert.equal(parseClassify("garbage", cands), "general");
});

test("本文の下書きは空の欄を出さない", () => {
  const mode = MODE_BY_ID.dev;
  const s = parseSummary({ overview: "概要", decisions: [{ text: "Aに決定", q: "Aで" }], todos: [{ task: "実装", owner: "", due: "", q: "" }] }, mode);
  const t = summaryToText(s, mode);
  assert.match(t, /■ 決定事項\n・Aに決定/);
  assert.doesNotMatch(t, /採らなかった案/);
  assert.doesNotMatch(t, /ToDo/); // ToDoは表で管理する（本文と二重にしない）
});

test("モードの指示には、そのモードの欄とルールが入る", () => {
  const sys = summarySystem(MODE_BY_ID.legal);
  assert.match(sys, /"grounds"/);
  assert.match(sys, /結論を断定しない/);
});
