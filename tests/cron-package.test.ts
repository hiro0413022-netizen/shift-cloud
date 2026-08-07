// @yozan/cron（MODULARIZATION_PLAN ④）のテスト。
// CRON_SECRET認可はgenesis/demo-salesの実装と同一ロジックであることを固定する
// （報告パイプライン停止＝401空振りの再発防止線）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { requireCronAuth, createCronHandler } from "../packages/cron/src/server.ts";

const SECRET = "cron_test_secret";
const req = (auth?: string) =>
  new Request("https://x.example/api/cron/daily", { headers: auth ? { authorization: auth } : {} });

test("認可: secret未設定は全部401（Vercel環境変数の設定漏れが黙って素通りしない）", () => {
  assert.equal(requireCronAuth(req(`Bearer ${SECRET}`), undefined)?.status, 401);
});

test("認可: ヘッダ無し・値違いは401、正しいBearerはnull(通過)", () => {
  assert.equal(requireCronAuth(req(), SECRET)?.status, 401);
  assert.equal(requireCronAuth(req("Bearer wrong"), SECRET)?.status, 401);
  assert.equal(requireCronAuth(req(SECRET), SECRET)?.status, 401); // Bearer接頭辞なしも弾く
  assert.equal(requireCronAuth(req(`Bearer ${SECRET}`), SECRET), null);
});

test("ハンドラ: 会社ごとに実行し、1社の失敗は他社を巻き込まない（genesis dailyと同方針）", async () => {
  const handler = createCronHandler({
    secret: () => SECRET,
    listCompanies: async () => ["c1", "c2", "c3"],
    run: async (id) => {
      if (id === "c2") throw new Error("boom");
      return { done: id };
    },
  });
  const res = await handler(req(`Bearer ${SECRET}`));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean; results: Array<Record<string, unknown>> };
  assert.equal(body.ok, true);
  assert.equal(body.results.length, 3);
  assert.equal(body.results[0].done, "c1");
  assert.match(String(body.results[1].error), /boom/);
  assert.equal(body.results[2].done, "c3");
});

test("ハンドラ: 認可NGならlistCompaniesすら呼ばれない", async () => {
  let called = false;
  const handler = createCronHandler({
    secret: () => SECRET,
    listCompanies: async () => { called = true; return []; },
    run: async () => ({}),
  });
  assert.equal((await handler(req("Bearer wrong"))).status, 401);
  assert.equal(called, false);
});
