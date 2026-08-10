// SNS自動投稿の「順番待ち」テスト（2026-08-10のX投稿停止の再発防止）
// ※ import は .ts 拡張子付きが必須（node --test の型ストリップの制約）
//
// 実際に起きたこと:
//   Xは承認なしで投稿できる（x_auto）が、Instagramは承認が要る。
//   承認されないまま残った行は status=awaiting_approval のまま永久に消えない。
//   publishDue が古い順に3件しか拾わない実装だったため、
//   「Xは投稿済み・IGは承認待ち」の残骸3件が枠を占領し、
//   8/9以降の新しい投稿に一度も順番が回らなくなった（8/8を最後にXが停止）。
import test from "node:test";
import assert from "node:assert/strict";
import { hasPendingWork } from "../packages/content/src/due.ts";
import type { CntPost } from "../packages/content/src/types.ts";

function post(over: Partial<CntPost>): CntPost {
  return {
    id: "p1",
    companyId: "c1",
    product: "swing-cortex",
    platform: "instagram",
    theme: null,
    hook: "",
    body: "",
    hashtags: [],
    status: "awaiting_approval",
    scheduledAt: null,
    postedAt: null,
    igMediaId: null,
    xTweetId: null,
    xPostedAt: null,
    error: null,
    xError: null,
    threadParts: [],
    threadTweetIds: [],
    source: {},
    metrics: {},
    queueId: null,
    createdAt: "2026-08-01T00:00:00Z",
    ...over,
  } as CntPost;
}

test("承認待ち × X投稿済み ＝ もう用事なし（枠を占領させない）", () => {
  assert.equal(hasPendingWork(post({ xTweetId: "123" }), true), false);
});

test("承認待ち × X未投稿 ＝ 投稿する", () => {
  assert.equal(hasPendingWork(post({}), true), true);
});

test("承認済み（scheduled）は常に対象＝この場でposted/failedに確定するので溜まらない", () => {
  assert.equal(hasPendingWork(post({ status: "scheduled", xTweetId: "123" }), true), true);
});

test("x_auto=off なら承認待ちは一切拾わない（Instagramは承認が要る）", () => {
  assert.equal(hasPendingWork(post({}), false), false);
});

test("連投は途中まででも残作業あり／全部投げ終われば用事なし", () => {
  const parts = ["1", "2", "3"];
  assert.equal(hasPendingWork(post({ threadParts: parts, threadTweetIds: ["a"] }), true), true);
  assert.equal(hasPendingWork(post({ threadParts: parts, threadTweetIds: ["a", "b", "c"] }), true), false);
});

test("止まったままの連投（stall上限）は枠を返す＝後続の投稿を止めない", () => {
  const stuck = post({ threadParts: ["1", "2"], threadTweetIds: [], source: { thread_stalls: 6 } });
  assert.equal(hasPendingWork(stuck, true), false);
});
