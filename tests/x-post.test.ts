// X（旧Twitter）投稿アダプタのテスト（DECISIONS #103 / @yozan/content）
// ※ import は .ts 拡張子付きが必須（node --test の型ストリップの制約）
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { buildOAuthHeader, buildTweetText, weightedLength, X_WEIGHTED_LIMIT } from "../packages/content/src/x.ts";

/* ============================================================
   OAuth 1.0a 署名
   署名を1文字でも間違えると 401 になり、原因が画面から追いにくい。
   Twitter公式ドキュメントに載っている既知の署名ベース文字列と突き合わせて固定する。
   ============================================================ */

const CFG = {
  apiKey: "xvz1evFS4wEEPTGEFPHBog",
  apiSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
  accessToken: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
  accessSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
};

// 公式ドキュメント記載の署名ベース文字列（この文字列を再現できれば署名は正しい）
const DOC_BASE =
  "POST&https%3A%2F%2Fapi.twitter.com%2F1.1%2Fstatuses%2Fupdate.json&include_entities%3Dtrue%26oauth_consumer_key%3Dxvz1evFS4wEEPTGEFPHBog%26oauth_nonce%3DkYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg%26oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D1318622958%26oauth_token%3D370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb%26oauth_version%3D1.0%26status%3DHello%2520Ladies%2520%252B%2520Add%2520Me%2521%2520%2523Guybrush";

const pct = (v: string) => encodeURIComponent(v).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const expectedSignature = createHmac("sha1", `${pct(CFG.apiSecret)}&${pct(CFG.accessSecret)}`)
  .update(DOC_BASE)
  .digest("base64");

test("buildOAuthHeader: 公式ドキュメントの既知ベクタと署名が一致する", async () => {
  const header = await buildOAuthHeader(CFG, "POST", "https://api.twitter.com/1.1/statuses/update.json", {
    oauth_nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
    oauth_timestamp: "1318622958",
    include_entities: "true",
    status: "Hello Ladies + Add Me! #Guybrush",
  });
  const got = decodeURIComponent(/oauth_signature="([^"]+)"/.exec(header)?.[1] ?? "");
  assert.equal(got, expectedSignature);
});

test("buildOAuthHeader: 必須のoauthパラメータが揃い、値はパーセントエンコードされる", async () => {
  const header = await buildOAuthHeader(CFG, "POST", "https://api.x.com/2/tweets");
  assert.match(header, /^OAuth /);
  for (const k of [
    "oauth_consumer_key",
    "oauth_nonce",
    "oauth_signature",
    "oauth_signature_method",
    "oauth_timestamp",
    "oauth_token",
    "oauth_version",
  ]) {
    assert.ok(header.includes(`${k}="`), `${k} がヘッダに無い`);
  }
  // access_token に含まれる '-' は素通し、'=' や '+' は必ずエンコードされている
  assert.ok(!/oauth_signature="[^"]*[+=]/.test(header), "署名が生の + / = を含んでいる");
});

test("buildOAuthHeader: nonceは毎回変わる（リプレイ拒否されないため）", async () => {
  const [a, b] = await Promise.all([
    buildOAuthHeader(CFG, "POST", "https://api.x.com/2/tweets"),
    buildOAuthHeader(CFG, "POST", "https://api.x.com/2/tweets"),
  ]);
  const nonceOf = (h: string) => /oauth_nonce="([^"]+)"/.exec(h)?.[1];
  assert.notEqual(nonceOf(a), nonceOf(b));
});

/* ============================================================
   本文の組み立て（280重み以内）
   Xは全角を2文字として数える＝日本語は実質140字。IG用の400字本文をそのまま送ると必ず落ちる。
   ============================================================ */

const LP = "https://yozan-genesis.vercel.app/lp/swing-cortex?src=x";
/** URLはt.co短縮で一律23文字扱い。実測時は23文字のダミーに置換して数える */
const weightAsSent = (t: string) => weightedLength(t.replace(LP, "x".repeat(23)));

test("weightedLength: 半角=1・全角=2", () => {
  assert.equal(weightedLength("hello"), 5);
  assert.equal(weightedLength("こんにちは！"), 12);
});

test("buildTweetText: 長文でも上限内に収まり、URLとタグが残る", () => {
  const long = "スライスの原因は振り遅れです。".repeat(20);
  const t = buildTweetText({
    body: long,
    hashtags: ["#ゴルフレッスン", "#ゴルフコーチ", "#3つ目は捨てる"],
    url: LP,
  });
  assert.ok(weightAsSent(t) <= X_WEIGHTED_LIMIT, `重み超過: ${weightAsSent(t)}`);
  assert.ok(t.includes(LP), "LPリンクが落ちている");
  assert.equal((t.match(/#/g) ?? []).length, 2, "ハッシュタグは2つまで");
  assert.ok(t.includes("…"), "切り詰め記号が無い");
});

test("buildTweetText: 短文はそのまま（余計な加工をしない）", () => {
  assert.equal(buildTweetText({ body: "テスト投稿です。", hashtags: [], url: null }), "テスト投稿です。");
});

test("buildTweetText: URL無し・タグ無しでも上限を守る", () => {
  const t = buildTweetText({ body: "あ".repeat(300), hashtags: [], url: null });
  assert.ok(weightedLength(t) <= X_WEIGHTED_LIMIT, `重み超過: ${weightedLength(t)}`);
});

test("buildTweetText: 本文が空でもURLだけは残る（投稿を落とさない）", () => {
  const t = buildTweetText({ body: "", hashtags: [], url: LP });
  assert.ok(t.includes(LP));
});
