// X連続投稿（スレッド）のテスト（migration 0096 / @yozan/content）
// ※ import は .ts 拡張子付きが必須（node --test の型ストリップの制約）
//
// ここで守りたいのは1つだけ:「公開済みの投稿を二度出さない」。
// 取り消せない公開投稿なので、途中失敗時の再開が唯一の正しい挙動になる。
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeThreadParts, publishThread, weightedLength, X_WEIGHTED_LIMIT } from "../packages/content/src/x.ts";

const CFG = { apiKey: "k", apiSecret: "s", accessToken: "t", accessSecret: "ts" };

/** publishTweet が叩く fetch を差し替えて、呼ばれた内容を記録する */
function stubFetch(behavior: (call: { text: string; replyTo: string | null; n: number }) => { ok: boolean; id?: string; status?: number }) {
  const calls: Array<{ text: string; replyTo: string | null }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: { body?: string }) => {
    const payload = JSON.parse(String(init?.body ?? "{}"));
    const replyTo = payload?.reply?.in_reply_to_tweet_id ?? null;
    calls.push({ text: payload.text, replyTo });
    const res = behavior({ text: payload.text, replyTo, n: calls.length });
    return {
      ok: res.ok,
      status: res.status ?? (res.ok ? 200 : 500),
      json: async () => (res.ok ? { data: { id: res.id } } : { detail: "boom" }),
    };
  }) as unknown as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("publishThread: 2本目以降は直前のツイートへの返信として繋がる", async () => {
  const f = stubFetch(({ n }) => ({ ok: true, id: `100${n}` }));
  try {
    const res = await publishThread(CFG, ["一本目", "二本目", "三本目"]);
    assert.equal(res.done, true);
    assert.deepEqual(res.tweetIds, ["1001", "1002", "1003"]);
    assert.equal(f.calls[0].replyTo, null, "1本目は返信ではない");
    assert.equal(f.calls[1].replyTo, "1001");
    assert.equal(f.calls[2].replyTo, "1002");
  } finally {
    f.restore();
  }
});

test("publishThread: 途中で失敗しても、投稿できたぶんのIDは返る（＝再開点になる）", async () => {
  const f = stubFetch(({ n }) => (n === 3 ? { ok: false, status: 429 } : { ok: true, id: `20${n}` }));
  try {
    const res = await publishThread(CFG, ["a", "b", "c", "d"]);
    assert.equal(res.done, false);
    assert.deepEqual(res.tweetIds, ["201", "202"], "落ちる前の2本は必ず返す");
    assert.match(res.error ?? "", /3\/4本目で中断/);
  } finally {
    f.restore();
  }
});

test("publishThread: 再開時は投稿済みのぶんを飛ばし、末尾を親にして続きだけ出す", async () => {
  const f = stubFetch(({ n }) => ({ ok: true, id: `30${n}` }));
  try {
    const res = await publishThread(CFG, ["a", "b", "c", "d"], ["201", "202"]);
    assert.equal(res.done, true);
    assert.equal(f.calls.length, 2, "すでに出した2本は再投稿しない");
    assert.deepEqual(f.calls.map((c) => c.text), ["c", "d"]);
    assert.equal(f.calls[0].replyTo, "202", "再開1本目の親は投稿済みの末尾");
  } finally {
    f.restore();
  }
});

test("publishThread: 全部投稿済みならAPIを一度も叩かない（cronが何度回っても増えない）", async () => {
  const f = stubFetch(() => ({ ok: true, id: "x" }));
  try {
    const res = await publishThread(CFG, ["a", "b"], ["1", "2"]);
    assert.equal(res.done, true);
    assert.equal(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

test("publishThread: 1tickの本数に上限があり、残りは未完了として返る", async () => {
  const f = stubFetch(({ n }) => ({ ok: true, id: `40${n}` }));
  try {
    const parts = Array.from({ length: 5 }, (_, i) => `p${i}`);
    const res = await publishThread(CFG, parts, [], { maxPerRun: 2 });
    assert.equal(res.done, false);
    assert.equal(res.tweetIds.length, 2);
    assert.match(res.error ?? "", /残り3本/);
  } finally {
    f.restore();
  }
});

test("normalizeThreadParts: 空要素は捨て、上限超過は落とさず末尾を削る", () => {
  const long = "あ".repeat(300); // 全角300字 = 重み600
  const parts = normalizeThreadParts(["  一本目  ", "", "   ", long]);
  assert.equal(parts.length, 2);
  assert.equal(parts[0], "一本目");
  assert.ok(weightedLength(parts[1]) <= X_WEIGHTED_LIMIT, "上限内に収まる");
});
