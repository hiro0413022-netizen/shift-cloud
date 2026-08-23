import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFollowDraft, reasonLine } from "../apps/member-os/src/lib/follow-draft.ts";

/**
 * AI店長 第1弾: フォロー文面の下書き（#148）
 * 守りたいこと:
 *   ① 氏名が無くても壊れず「お客様」で出る
 *   ② 体験目的に応じた一文が入る（アンケートを無駄にしない）
 *   ③ サイトURLは渡した店舗だけに入る（GOLF WINGの文面にFRANKのURLが混ざらない）
 */

test("氏名なしは「お客様」・件名に店舗名", () => {
  const d = buildFollowDraft({ guestName: null, visitedOn: "2026-08-10", trialReason: null, storeName: "FRANK GOLF 姫路" });
  assert.ok(d.body.startsWith("お客様様") === false);
  assert.ok(d.body.startsWith("お客様"));
  assert.ok(d.subject.includes("FRANK GOLF 姫路"));
  assert.ok(d.body.includes("8月10日"));
});

test("体験目的で一文が変わる", () => {
  assert.ok(reasonLine("飛距離を伸ばすため").includes("飛距離"));
  assert.ok(reasonLine("PGAプロに習ってみたい").includes("マンツーマン"));
  assert.ok(reasonLine("天候に左右されない練習環境").includes("インドア"));
  assert.ok(reasonLine(null).length > 0);
});

test("サイトURLは指定時のみ", () => {
  const base = { guestName: "田中", visitedOn: "2026-08-01", trialReason: null, storeName: "GOLF WING 宝塚" };
  assert.ok(!buildFollowDraft(base).body.includes("http"));
  const withUrl = buildFollowDraft({ ...base, storeName: "FRANK GOLF 姫路", siteUrl: "https://frankgolf.jp" });
  assert.ok(withUrl.body.includes("https://frankgolf.jp"));
  assert.ok(withUrl.body.includes("田中様"));
});
