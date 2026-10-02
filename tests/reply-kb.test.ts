import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KB,
  REPLY_INTENTS,
  intentsFor,
  buildReplySystem,
  buildReplyUser,
  parseReplyOutput,
  brandFromStoreName,
  validateReplyInput,
} from "../packages/core/src/reply-kb.ts";

/**
 * 返信文アシスタント（公式LINE・メール）
 * 守りたいこと:
 *   ① 店舗の取り違えをしない — GOLF WING のプロンプトに FRANK の事実（電話・住所）が混ざらない、その逆も
 *   ② 料金の正本は公式サイトどおり（値上げ後の GOLF WING／FRANK の月会費）
 *   ③ メールは署名つき・LINEは署名なし
 *   ④ モデル出力のタグが崩れても返信文は取り出せる
 *   ⑤ 公開リポジトリなので、ナレッジに社内情報（口座・詳細住所）を書かない
 */

test("店舗の取り違えをしない（プロンプトに他店の電話・住所が入らない）", () => {
  const gw = buildReplySystem("golfwing", "line");
  const fr = buildReplySystem("frank", "line");
  assert.ok(gw.includes("0797-82-0833"));
  assert.ok(!gw.includes("079-260-6671"));
  assert.ok(!gw.includes("土山"));
  assert.ok(fr.includes("079-260-6671"));
  assert.ok(!fr.includes("0797-82-0833"));
  assert.ok(!fr.includes("山本南"));
});

test("料金は公式サイトどおり", () => {
  assert.match(KB.golfwing, /レギュラー会員: 19,800円\/月（税込21,780円）/);
  assert.match(KB.golfwing, /マスター会員: 24,800円\/月（税込27,280円）/);
  assert.match(KB.frank, /レギュラー会員: 13,800円\/月（税込15,180円）/);
  assert.match(KB.frank, /ライト会員: 9,800円\/月（税込10,780円）/);
  assert.match(KB.frank, /定休日 毎週火曜日/);
});

test("メールは署名あり・LINEは署名を付けない", () => {
  const mail = buildReplySystem("frank", "email");
  const line = buildReplySystem("frank", "line");
  assert.ok(mail.includes("件名: "));
  assert.ok(mail.includes("FRANK GOLF 姫路\nTEL 079-260-6671"));
  assert.ok(line.includes("署名は付けない"));
});

test("用件ボタンはブランドごとに出し分け（YOZAN に体験ボタンは無い）", () => {
  assert.ok(intentsFor("golfwing").some((i) => i.key === "trial"));
  assert.ok(!intentsFor("yozan").some((i) => i.key === "trial"));
  assert.ok(intentsFor("yozan").some((i) => i.key === "partnership"));
  const keys = REPLY_INTENTS.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length, "用件キーの重複");
});

test("文面なしでも用件だけで依頼文が組める／修正指示は直前案を含む", () => {
  const u = buildReplyUser({ brand: "golfwing", channel: "line", intentKey: "trial" });
  assert.ok(u.includes("体験したい"));
  assert.ok(u.includes("（なし"));
  const r = buildReplyUser({
    brand: "golfwing",
    channel: "line",
    customerMessage: "体験したいです",
    previousDraft: "前の案",
    adjust: "もっと短く",
  });
  assert.ok(r.includes("前の案") && r.includes("もっと短く"));
});

test("出力の解析: タグあり／確認なし／タグ崩れ", () => {
  const a = parseReplyOutput("<reply>\nこんにちは\n</reply>\n<check>\n- 空き状況を確認\n- 体験無料が実施中か\n</check>");
  assert.equal(a.reply, "こんにちは");
  assert.deepEqual(a.checks, ["空き状況を確認", "体験無料が実施中か"]);
  const b = parseReplyOutput("<reply>本文</reply><check></check>");
  assert.deepEqual(b.checks, []);
  const c = parseReplyOutput("タグ無しの本文");
  assert.equal(c.reply, "タグ無しの本文");
  const d = parseReplyOutput("<reply>途中で切れた本文");
  assert.equal(d.reply, "途中で切れた本文");
});

test("所属店舗名から既定ブランド", () => {
  assert.equal(brandFromStoreName("FRANK GOLF 姫路"), "frank");
  assert.equal(brandFromStoreName("ゴルフウイング 宝塚"), "golfwing");
  assert.equal(brandFromStoreName(null), "golfwing");
});

test("公開リポジトリ: ナレッジに口座・詳細住所を書かない", () => {
  const all = Object.values(KB).join("\n");
  assert.ok(!/普通\d|口座|平井/.test(all));
});

test("入力検証（/chat と /store 共用）: 不正な窓口・空入力を弾く", () => {
  assert.ok("error" in validateReplyInput({ brand: "other", channel: "line", intentKey: "trial" }));
  assert.ok("error" in validateReplyInput({ brand: "frank", channel: "fax", intentKey: "trial" }));
  assert.ok("error" in validateReplyInput({ brand: "frank", channel: "line" }));
  assert.ok("error" in validateReplyInput({ brand: "frank", channel: "line", intentKey: "nope" }));
  const ok = validateReplyInput({ brand: "golfwing", channel: "email", intentKey: "price" });
  assert.ok("req" in ok && ok.req.brand === "golfwing" && ok.req.channel === "email");
  assert.ok("req" in validateReplyInput({ brand: "yozan", channel: "line", customerMessage: "取材のお願い" }));
});
