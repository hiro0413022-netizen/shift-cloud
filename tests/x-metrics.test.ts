// Xの反応数取得のテスト（DECISIONS #109 / @yozan/content）
// ※ import は .ts 拡張子付きが必須（node --test の型ストリップの制約）
//
// ここで守りたいのは2つ:
//   ① 課金の形（自分のタイムラインを1回だけ読む・Owned Reads $0.001/件）を崩さない
//   ② OAuth 1.0a の GET は**クエリも署名対象**だが、Authorizationヘッダには oauth_* しか入れない
import test from "node:test";
import assert from "node:assert/strict";
import { fetchOwnTweetMetrics, sumMetrics, EMPTY_METRICS, buildOAuthHeader } from "../packages/content/src/x.ts";

const CFG = { apiKey: "k", apiSecret: "s", accessToken: "t", accessSecret: "ts" };

function stubFetch(body: unknown) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    calls.push(String(url));
    return { ok: true, status: 200, json: async () => body };
  }) as unknown as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test("fetchOwnTweetMetrics: 自分のタイムラインを1回だけ叩く（IDごとに引くと5倍課金される）", async () => {
  const f = stubFetch({ data: [] });
  try {
    await fetchOwnTweetMetrics(CFG, "12345", { maxResults: 100 });
    assert.equal(f.calls.length, 1, "呼び出しは1回だけ");
    assert.match(f.calls[0], /\/2\/users\/12345\/tweets/, "Owned Reads のエンドポイントを使う");
    assert.match(f.calls[0], /max_results=100/);
    assert.match(f.calls[0], /public_metrics/);
  } finally {
    f.restore();
  }
});

test("fetchOwnTweetMetrics: public_metrics をID→反応数の表に変換する", async () => {
  const f = stubFetch({
    data: [
      { id: "1", public_metrics: { like_count: 3, retweet_count: 1, reply_count: 2, quote_count: 0, bookmark_count: 4, impression_count: 500 } },
      { id: "2", public_metrics: { like_count: 1 } },
    ],
  });
  try {
    const map = await fetchOwnTweetMetrics(CFG, "12345");
    assert.deepEqual(map.get("1"), { likes: 3, reposts: 1, replies: 2, quotes: 0, bookmarks: 4, impressions: 500 });
    // 欠けた項目は0、表示回数は「返らなかった」を0と区別してnullにする
    assert.deepEqual(map.get("2"), { likes: 1, reposts: 0, replies: 0, quotes: 0, bookmarks: 0, impressions: null });
  } finally {
    f.restore();
  }
});

test("sumMetrics: 連投は全体を合計し、表示回数は取れたぶんだけ足す", () => {
  const total = sumMetrics([
    { ...EMPTY_METRICS, likes: 5, replies: 1, impressions: 100 },
    { ...EMPTY_METRICS, likes: 2, reposts: 3, impressions: null },
  ]);
  assert.equal(total.likes, 7);
  assert.equal(total.reposts, 3);
  assert.equal(total.replies, 1);
  assert.equal(total.impressions, 100, "nullは加算せず、取れたぶんだけ合計する");
});

test("sumMetrics: 1本も取れなければ表示回数はnullのまま（0と誤解させない）", () => {
  assert.equal(sumMetrics([]).impressions, null);
});

test("buildOAuthHeader: クエリは署名に使うがAuthorizationヘッダには載せない", async () => {
  const header = await buildOAuthHeader(CFG, "GET", "https://api.x.com/2/users/1/tweets", {
    max_results: "100",
    "tweet.fields": "public_metrics",
  });
  assert.ok(!header.includes("max_results"), "oauth_* 以外がヘッダに混ざっている");
  assert.ok(!header.includes("tweet.fields"));
  assert.ok(header.includes("oauth_signature="));
});
