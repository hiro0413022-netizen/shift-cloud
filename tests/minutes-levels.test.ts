// 議事録システムの機密レベル（2026-09-27）
//
// 守りたいのは1つ: **L3（秘匿）の会議を、外部のAIに流す経路が存在しないこと。**
// ここが崩れると、弁護士向けに売る前提そのものが消える。
import { test } from "node:test";
import assert from "node:assert/strict";
import { providerFor, levelStatus, canView, LevelRoutingError } from "../apps/minutes/src/lib/levels.ts";

const GEMINI = { GEMINI_API_KEY: "k" };

test("L3 は Gemini のキーがあっても Gemini に流さない", () => {
  assert.throws(() => providerFor("L3", { ...GEMINI, MINUTES_L2_ENABLED: "1" }), LevelRoutingError);
});

test("L3 はYOZANサーバーが片方しか無くても止める（文字起こしだけ外に出る、を作らない）", () => {
  assert.throws(() => providerFor("L3", { ...GEMINI, LOCAL_LLM_BASE_URL: "http://x" }), LevelRoutingError);
  assert.throws(() => providerFor("L3", { ...GEMINI, LOCAL_STT_BASE_URL: "http://x" }), LevelRoutingError);
});

test("L3 はYOZANサーバーがそろったときだけ local", () => {
  assert.equal(providerFor("L3", { ...GEMINI, LOCAL_LLM_BASE_URL: "http://a", LOCAL_STT_BASE_URL: "http://b" }), "local");
});

test("L1 は Gemini、L2 は有料APIの確認が済んでから", () => {
  assert.equal(providerFor("L1", GEMINI), "gemini");
  assert.throws(() => providerFor("L2", GEMINI), LevelRoutingError);
  assert.equal(providerFor("L2", { ...GEMINI, MINUTES_L2_ENABLED: "1" }), "gemini");
});

test("フェーズ1では L3 の会議は作れない（サーバーがあっても）", () => {
  const s = levelStatus("L3", { ...GEMINI, LOCAL_LLM_BASE_URL: "a", LOCAL_STT_BASE_URL: "b" });
  assert.equal(s.available, false);
});

test("L2 は作成者とオーナーだけが見られる", () => {
  const m = { createdBy: "me" };
  assert.equal(canView("L2", m, { staffId: "me", isOwner: false }), true);
  assert.equal(canView("L2", m, { staffId: "other", isOwner: false }), false);
  assert.equal(canView("L2", m, { staffId: "other", isOwner: true }), true);
  assert.equal(canView("L1", m, { staffId: "other", isOwner: false }), true);
});

test("不明なレベルは投げる", () => {
  // @ts-expect-error 型の外から来た値
  assert.throws(() => providerFor("L9", GEMINI), LevelRoutingError);
});
