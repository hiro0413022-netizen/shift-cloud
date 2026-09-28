// Genesis #304: Focus / CEO モード — cookie の解釈は許可された店舗・案件だけ。CEO はオーナーだけ
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFocus, serializeFocus, focusPromptLines, EMPTY_FOCUS } from "../apps/genesis/src/lib/focus-pure.ts";

test("parseFocus: 壊れた cookie は空・許可外の店舗/案件は落とす・CEO はオーナーだけ", () => {
  const allow = { stores: ["frank", "gw"], projects: ["p1"], canCeo: true };
  assert.deepEqual(parseFocus(undefined, allow), EMPTY_FOCUS);
  assert.deepEqual(parseFocus("{bad json", allow), EMPTY_FOCUS);
  assert.deepEqual(parseFocus(serializeFocus({ store: "gw", project: "p1", ceo: true }), allow), { store: "gw", project: "p1", ceo: true });
  assert.deepEqual(parseFocus(serializeFocus({ store: "other", project: "p9", ceo: true }), allow), { store: null, project: null, ceo: true });
  assert.deepEqual(parseFocus(serializeFocus({ store: "gw", project: null, ceo: true }), { ...allow, canCeo: false }), { store: "gw", project: null, ceo: false });
});

test("focusPromptLines: 絞りが無ければ空・店舗と案件と CEO の行", () => {
  assert.deepEqual(focusPromptLines(EMPTY_FOCUS, {}), []);
  const lines = focusPromptLines({ store: "gw", project: "p1", ceo: true }, { store: "GOLF WING", project: "2号店" });
  assert.ok(lines[0].startsWith("## いまの Focus"));
  assert.ok(lines.some((l) => l.includes("「GOLF WING」")));
  assert.ok(lines.some((l) => l.includes("「2号店」")));
  assert.ok(lines.some((l) => l.startsWith("## CEO モード")));
});
