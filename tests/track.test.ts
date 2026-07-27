import { test } from "node:test";
import assert from "node:assert/strict";
import { injectTracking, trackingSnippet } from "../packages/track/src/beacon.ts";
import { formatDuration } from "../packages/track/src/server.ts";

/**
 * @yozan/track（#95）の純粋関数を固定する。
 * 計測は「相手に見せているページ」に差し込むので、壊れ方が事故に直結する:
 *  - 二重注入で二重カウント
 *  - </body> が無いHTMLで消える
 *  - トークンの引用符でスクリプトが壊れてページが白くなる
 */

const OPTS = { endpoint: "/api/track", token: "abc123" };

test("ビーコンは </body> の直前に入る", () => {
  const html = "<html><body><h1>デモ</h1></body></html>";
  const out = injectTracking(html, OPTS);
  assert.ok(out.includes("data-yozan-track"));
  assert.ok(out.indexOf("data-yozan-track") < out.indexOf("</body>"));
  assert.ok(out.startsWith("<html><body><h1>デモ</h1>"));
});

test("二重注入はしない（二重カウントの防止）", () => {
  const once = injectTracking("<html><body>x</body></html>", OPTS);
  const twice = injectTracking(once, OPTS);
  assert.equal(once, twice);
  assert.equal(twice.split("data-yozan-track").length - 1, 1);
});

test("</body> が無いHTMLでも末尾に入る（計測が消えない）", () => {
  const out = injectTracking("<div>断片</div>", OPTS);
  assert.ok(out.startsWith("<div>断片</div>"));
  assert.ok(out.includes("data-yozan-track"));
});

test("空HTMLはそのまま返す", () => {
  assert.equal(injectTracking("", OPTS), "");
});

test("トークンはJSONとして埋め込まれる（引用符でスクリプトを壊さない）", () => {
  const snippet = trackingSnippet({ endpoint: "/api/track", token: `a"b'c` });
  assert.ok(snippet.includes(String.raw`a\"b'c`));
  assert.ok(!snippet.includes(`"token":"a"b`));
});

test("社内プレビューのフラグがスニペットに乗る", () => {
  assert.ok(trackingSnippet({ ...OPTS, internal: true }).includes('"internal":true'));
  assert.ok(trackingSnippet({ ...OPTS }).includes('"internal":false'));
});

test("ハートビート間隔は5秒未満にできない（過剰POSTの防止）", () => {
  assert.ok(trackingSnippet({ ...OPTS, heartbeatSeconds: 1 }).includes('"hb":5'));
  assert.ok(trackingSnippet({ ...OPTS, heartbeatSeconds: 30 }).includes('"hb":30'));
});

test("滞在時間の表示", () => {
  assert.equal(formatDuration(0), "0秒");
  assert.equal(formatDuration(45), "45秒");
  assert.equal(formatDuration(60), "1分");
  assert.equal(formatDuration(200), "3分20秒");
  assert.equal(formatDuration(3600), "1時間0分");
  assert.equal(formatDuration(-5), "0秒");
});
