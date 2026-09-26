// 期間限定キャンペーンの掲載判定（#280・2026-09-26）
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  campaignActive,
  campaignDaysLeft,
  deadlineLabel,
  ymdLabelJa,
} from "../packages/core/src/frank-campaign.ts";
import {
  CAMPAIGN_BONUS_DAY,
  CAMPAIGN_UNTIL_APPLY,
  CAMPAIGN_FREE_FROM_APPLY,
} from "../packages/core/src/frank-billing-start.ts";

const cfg = { enabled: true, until: "2026-10-31" };

test("期限内は出す・翌日から出さない（11月に10月キャンペーンを残さない）", () => {
  assert.equal(campaignActive("2026-09-26", cfg), true);
  assert.equal(campaignActive("2026-10-31", cfg), true); // 最終日いっぱい
  assert.equal(campaignActive("2026-11-01", cfg), false);
});

test("enabled:false なら期限内でも出さない（急に止めたいとき）", () => {
  assert.equal(campaignActive("2026-10-01", { enabled: false, until: "2026-10-31" }), false);
});

test("設定が壊れていたら出さない（出しっぱなしにしない）", () => {
  assert.equal(campaignActive("2026-10-01", null), false);
  assert.equal(campaignActive("2026-10-01", {}), false);
  assert.equal(campaignActive("2026-10-01", { enabled: true, until: "10月末" }), false);
  assert.equal(campaignActive("2026-10-01", { enabled: true, until: null }), false);
});

test("残り日数は暦日の差", () => {
  assert.equal(campaignDaysLeft("2026-10-31", "2026-10-31"), 0);
  assert.equal(campaignDaysLeft("2026-10-30", "2026-10-31"), 1);
  assert.equal(campaignDaysLeft("2026-09-26", "2026-10-31"), 35);
  assert.equal(campaignDaysLeft("2026-11-01", "2026-10-31"), -1);
});

test("締切の言い方に「あと0日」が出ない", () => {
  assert.equal(deadlineLabel(0), "本日まで");
  assert.equal(deadlineLabel(1), "明日まで");
  assert.equal(deadlineLabel(35), "あと35日");
  assert.equal(deadlineLabel(-1), "");
});

test("月末をまたぐ日数（10月は31日ある）", () => {
  // 9/26 から 10/31 まで＝9月の残り4日＋10月31日
  assert.equal(campaignDaysLeft("2026-09-26", "2026-10-31"), 4 + 31);
});

test("日付の見せ方", () => {
  assert.equal(ymdLabelJa("2026-10-31"), "10月31日");
  assert.equal(ymdLabelJa("2026-10-01"), "10月1日");
  assert.equal(ymdLabelJa("だめ"), "");
});

/* ------------------------------------------------------------------
   公式サイト側（assets/site.js）は node から import できないので、
   「JSTの出し方を間違えていないか」を書き方で見張る（#200 と同じ方式）。
   ------------------------------------------------------------------ */
test("site.js のキャンペーン判定が +09:00 パースを使っていない", () => {
  const src = readFileSync(new URL("../sites/frank-golf/assets/site.js", import.meta.url), "utf8");
  assert.equal(src.includes("T00:00:00+09:00"), false, "日付文字列に +09:00 を付けると1日ずれます");
  assert.ok(src.includes("data-campaign"), "site.js にキャンペーンの描画が入っていること");
});

/* ------------------------------------------------------------------
   サイトの掲載と、請求側の条件が食い違わないこと（#280）

   ここがズレると、いちばん痛い壊れ方になる:
     サイト「◯月分と翌月分が0円」 → 請求は1か月だけ無料 → 翌月分が引き落とされる
   お客様に見せた約束と請求が違う、をコードで止める。
   ------------------------------------------------------------------ */
const SITE_DATA = readFileSync(new URL("../sites/frank-golf/assets/site-data.js", import.meta.url), "utf8");
const SITE_JS = readFileSync(new URL("../sites/frank-golf/assets/site.js", import.meta.url), "utf8");

test("サイトの受付期限と、請求側の受付期限が同じ日", () => {
  const m = /until:\s*"(\d{4}-\d{2}-\d{2})"/.exec(SITE_DATA);
  assert.ok(m, "site-data.js の campaign.until が読めること");
  assert.equal(
    m![1],
    CAMPAIGN_UNTIL_APPLY,
    "サイトの掲載期限と CAMPAIGN_UNTIL_APPLY を必ず合わせてください（片方だけ直すと、掲載した約束と実際の請求が食い違います）",
  );
});

test("文言を切り替える日と、無料月数を決める日が同じ（20日）", () => {
  // site.js の既定値（base.bonusDay 未設定時のフォールバック）が請求側と揃っているか
  const m = /Number\(base\.bonusDay\) > 0 \? Number\(base\.bonusDay\) : (\d+)/.exec(SITE_JS);
  assert.ok(m, "site.js の bonusDay の既定値が読めること");
  assert.equal(
    Number(m![1]),
    CAMPAIGN_BONUS_DAY,
    "サイトの切り替え日と CAMPAIGN_BONUS_DAY がズレると、画面は2か月無料と言うのに請求は1か月になります",
  );
});

test("キャンペーンの適用開始日が、受付期限より前にある", () => {
  assert.ok(
    CAMPAIGN_FREE_FROM_APPLY <= CAMPAIGN_UNTIL_APPLY,
    "適用開始日が受付期限より後だと、出ているのに誰にも適用されない",
  );
});

test("20日ルールの仕組みそのものはサイトの掲載文に書かない（ユーザー指示）", () => {
  // お客様に見える文字列に「20日」が出ていないこと。
  // 出すと「20日を過ぎてから入ったほうが得」と読まれて、月の前半の入会が止まる。
  // 説明はコメントに書いてよいので、コメントを取り除いてから見る。
  const section = SITE_DATA.slice(SITE_DATA.indexOf("campaign: {"), SITE_DATA.indexOf("店舗基本情報"));
  const code = section.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  assert.equal(/20日/.test(code), false, "掲載文に「20日」を書かないでください（説明はコメントに）");
  // 置き換え用のプレースホルダが late 側に入っていること（当月・翌月を自動で出す）
  assert.ok(/\{m1\}/.test(section), "late の文言に {m1}（翌月）が入っていること");
});
