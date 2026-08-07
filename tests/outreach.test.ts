import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyCap, decideSend, normalizeEmail, shouldPause, type PolicyContext } from "../packages/outreach/src/policy.ts";
import { composeEmail, fill, pickTemplate, DEFAULT_TEMPLATES } from "../packages/outreach/src/compose.ts";
import { isForwardTransition, parseWebhook } from "../packages/outreach/src/resend.ts";
import { extractEmails } from "../packages/prospect/src/audit.ts";
import type { OutSettings, SendCandidate, TemplateRow } from "../packages/outreach/src/types.ts";

/**
 * @yozan/outreach（#111）の判定を固定する。
 * **メールは取り消せない**ので、ここが緩むと取り返しがつかない:
 *  - 公表されていないアドレスに送る → 特定電子メール法違反
 *  - 「営業お断り」「配信停止済み」に送る → 苦情・ドメインの信用崩壊
 *  - 法定表示が欠けた文面が出る → 1通でも違法
 *  - ウォームアップを飛ばす → 迷惑メール判定で全部届かなくなる
 */

const SETTINGS: OutSettings = {
  company_id: "c1",
  enabled: true,
  from_email: "web@send.yozan-group.jp",
  from_name: "株式会社YOZAN",
  reply_to: "info@yozan-group.jp",
  daily_cap_max: 50,
  warmup_start: "2026-08-01",
  send_hour_jst: 10,
  paused_at: null,
  paused_reason: null,
};

const OK_CANDIDATE: SendCandidate = {
  id: "p1",
  name: "まきの内科クリニック",
  industry: "naika",
  email: "info@makino-clinic.jp",
  emailSource: "site",
  score: 78,
  noSolicit: false,
  status: "demo_done",
  hasDemo: true,
  alreadySent: false,
};

const ctx = (over: Partial<PolicyContext> = {}): PolicyContext => ({
  settings: SETTINGS,
  suppressedEmails: new Set<string>(),
  suppressedDomains: new Set<string>(),
  sentToday: 0,
  dailyCap: 30,
  minScore: 55,
  ...over,
});

// ---------------------------------------------------------------- policy

test("条件が揃っていれば送信できる", () => {
  assert.equal(decideSend(OK_CANDIDATE, ctx()).ok, true);
});

test("サイトで公表されていないアドレスには送らない（特定電子メール法3条1項3号）", () => {
  for (const src of ["directory", "places", "manual", null]) {
    const d = decideSend({ ...OK_CANDIDATE, emailSource: src }, ctx());
    assert.equal(d.ok, false, `emailSource=${src} は送信不可のはず`);
    assert.equal(d.reason, "email_not_public");
  }
});

test("「営業お断り」の表示がある先には送らない", () => {
  const d = decideSend({ ...OK_CANDIDATE, noSolicit: true }, ctx());
  assert.equal(d.ok, false);
  assert.equal(d.reason, "no_solicit");
});

test("配信停止・バウンス済みのアドレスとドメインには送らない", () => {
  assert.equal(decideSend(OK_CANDIDATE, ctx({ suppressedEmails: new Set(["info@makino-clinic.jp"]) })).reason, "suppressed");
  assert.equal(decideSend(OK_CANDIDATE, ctx({ suppressedDomains: new Set(["makino-clinic.jp"]) })).reason, "suppressed");
});

test("同じ先に2通目は送らない", () => {
  assert.equal(decideSend({ ...OK_CANDIDATE, alreadySent: true }, ctx()).reason, "already_sent");
});

test("デモが無い先には送らない（見せるものが無いメールはただの売り込み）", () => {
  assert.equal(decideSend({ ...OK_CANDIDATE, hasDemo: false }, ctx()).reason, "no_demo");
});

test("送信OFF・自動停止中は何があっても送らない", () => {
  assert.equal(decideSend(OK_CANDIDATE, ctx({ settings: { ...SETTINGS, enabled: false } })).reason, "disabled");
  assert.equal(decideSend(OK_CANDIDATE, ctx({ settings: { ...SETTINGS, paused_at: "2026-08-07T00:00:00Z" } })).reason, "paused");
});

test("1日の上限に達したら止まる", () => {
  assert.equal(decideSend(OK_CANDIDATE, ctx({ sentToday: 30, dailyCap: 30 })).reason, "daily_cap");
});

test("スコアが低い先は送らない", () => {
  assert.equal(decideSend({ ...OK_CANDIDATE, score: 40 }, ctx()).reason, "low_score");
  assert.equal(decideSend({ ...OK_CANDIDATE, score: null }, ctx()).reason, "low_score");
});

test("メールアドレスの正規化（不正な文字列は通さない）", () => {
  assert.equal(normalizeEmail(" Info@Example.JP "), "info@example.jp");
  assert.equal(normalizeEmail("こわれた"), null);
  assert.equal(normalizeEmail(null), null);
});

// ---------------------------------------------------------------- ウォームアップ / 自動停止

test("ウォームアップは初日10通から1日10通ずつ増え、上限で頭打ちになる", () => {
  assert.equal(dailyCap("2026-08-01", "2026-08-01", 50), 10);
  assert.equal(dailyCap("2026-08-01", "2026-08-02", 50), 20);
  assert.equal(dailyCap("2026-08-01", "2026-08-05", 50), 50);
  assert.equal(dailyCap("2026-08-01", "2026-09-01", 50), 50);
  // 未設定＝まだ1通も送っていない → 最小値
  assert.equal(dailyCap(null, "2026-08-07", 50), 10);
  // 上限が10未満でも最小値を下回らせない設計（0通/日で静かに止まるのを防ぐ）
  assert.equal(dailyCap("2026-08-01", "2026-08-01", 5), 10);
});

test("迷惑メール報告2件で自動停止する", () => {
  assert.equal(shouldPause({ sent: 50, bounced: 0, complained: 2 }).pause, true);
  assert.equal(shouldPause({ sent: 50, bounced: 0, complained: 1 }).pause, false);
});

test("宛先不明が8%を超えたら自動停止する（母数が少ないうちは止めない）", () => {
  assert.equal(shouldPause({ sent: 50, bounced: 5, complained: 0 }).pause, true);
  assert.equal(shouldPause({ sent: 50, bounced: 3, complained: 0 }).pause, false);
  // 1通目がバウンスしただけで止まると運用にならない
  assert.equal(shouldPause({ sent: 3, bounced: 1, complained: 0 }).pause, false);
});

// ---------------------------------------------------------------- compose

const TPL: TemplateRow[] = [
  { key: "default", industry: null, subject: "既定 {{name}}", body: "既定本文 {{demoUrl}}", enabled: true, sort: 100 },
  { key: "vet", industry: "vet", subject: "動物 {{name}}", body: "動物本文", enabled: true, sort: 10 },
  { key: "off", industry: "naika", subject: "使わない", body: "x", enabled: false, sort: 1 },
];

test("業種一致を優先し、無ければ既定を使う。無効な文面は選ばれない", () => {
  assert.equal(pickTemplate(TPL, "vet")?.key, "vet");
  assert.equal(pickTemplate(TPL, "naika")?.key, "default"); // naika用は enabled=false
  assert.equal(pickTemplate([], "vet"), null);
});

test("未知の差込キーは空にする（{{foo}} が先方に見えるのを防ぐ）", () => {
  assert.equal(fill("こんにちは {{name}} {{unknown}}", { name: "A" }), "こんにちは A ");
});

test("法定表示（会社名・代表者・住所・配信停止URL）が必ず本文に入る", () => {
  const mail = composeEmail({
    template: TPL[0],
    prospect: { ...OK_CANDIDATE, improvePoints: "SSL未対応（http）\nスマートフォン未対応\n表示速度が遅い" },
    company: { companyName: "株式会社YOZAN", representative: "代表取締役 古川博庸", postalCode: "〒665-0816", address: "兵庫県宝塚市平井6-2-21-404" },
    demoUrl: "https://demo-sales-delta.vercel.app/d/abc",
    unsubUrl: "https://demo-sales-delta.vercel.app/unsubscribe/xyz",
    replyTo: "info@yozan-group.jp",
  });
  for (const must of ["株式会社YOZAN", "代表取締役 古川博庸", "兵庫県宝塚市平井6-2-21-404", "https://demo-sales-delta.vercel.app/unsubscribe/xyz", "info@yozan-group.jp"]) {
    assert.ok(mail.text.includes(must), `本文に ${must} が必要`);
    assert.ok(mail.html.includes(must), `HTMLに ${must} が必要`);
  }
});

test("改善余地は2つまでしか載せない（ダメ出しの手紙にしない）", () => {
  const mail = composeEmail({
    template: { key: "t", industry: null, subject: "s", body: "{{improve}}", enabled: true, sort: 1 },
    prospect: { ...OK_CANDIDATE, improvePoints: "A\nB\nC\nD" },
    company: { companyName: "X", representative: "Y", postalCode: "〒1", address: "Z" },
    demoUrl: "https://e.jp/d/1",
    unsubUrl: "https://e.jp/u/1",
    replyTo: "r@e.jp",
  });
  assert.ok(mail.text.includes("・A") && mail.text.includes("・B"));
  assert.ok(!mail.text.includes("・C"));
});

test("既定テンプレートに未置換の差込やMarkdown装飾が残っていない", () => {
  for (const t of DEFAULT_TEMPLATES) {
    assert.ok(!t.body.includes("**"), `${t.key}: メールでは ** が記号のまま見えてしまう`);
    const filled = fill(t.body, { name: "N", company: "C", representative: "R", improve: "・i", demoUrl: "https://e.jp/d/1" });
    assert.ok(!/\{\{|\}\}/.test(filled), `${t.key}: 差込が残っている`);
  }
});

// ---------------------------------------------------------------- webhook

test("Resendのイベントを状態に読み替える。未知のイベントは無視する", () => {
  const d = parseWebhook({ type: "email.delivered", data: { email_id: "m1", to: ["A@B.jp"] } });
  assert.equal(d?.status, "delivered");
  assert.equal(d?.atColumn, "delivered_at");
  assert.equal(d?.suppress, false);
  assert.equal(d?.email, "a@b.jp");

  const b = parseWebhook({ type: "email.bounced", data: { email_id: "m2", to: "x@y.jp" } });
  assert.equal(b?.suppress, true, "宛先不明は抑止リストに載せる");
  assert.equal(parseWebhook({ type: "email.unknown", data: { email_id: "m3" } }), null);
  assert.equal(parseWebhook({ type: "email.sent" }), null);
  assert.equal(parseWebhook(null), null);
});

test("Webhookは順不同で届くので状態を後戻りさせない", () => {
  assert.equal(isForwardTransition("queued", "sent"), true);
  assert.equal(isForwardTransition("delivered", "sent"), false);
  assert.equal(isForwardTransition("opened", "bounced"), true);
  assert.equal(isForwardTransition("opened", "delivered"), false);
});

// ---------------------------------------------------------------- メールアドレス抽出（①側）

test("先方サイトから公表アドレスを拾う。同一ドメインを優先し、ダミーは除外する", () => {
  const html = `<html><body>
    <a href="mailto:info@makino-clinic.jp">メール</a>
    <p>お問い合わせ: reception@makino-clinic.jp / 制作: webmaster@example.com</p>
    <img src="logo@2x.png"><a href="mailto:noreply@makino-clinic.jp">no</a>
  </body></html>`;
  const found = extractEmails(html, "https://www.makino-clinic.jp/contact");
  assert.equal(found[0], "info@makino-clinic.jp", "mailto: と同一ドメインが最優先");
  assert.ok(found.includes("reception@makino-clinic.jp"));
  assert.ok(!found.includes("webmaster@example.com"), "example.com は除外");
  assert.ok(!found.some((e) => e.includes("noreply")), "noreply は除外");
  assert.ok(!found.some((e) => e.includes("2x.png")), "画像ファイル名は除外");
});

test("アドレスが無いページからは何も返さない（推測でアドレスを作らない）", () => {
  assert.deepEqual(extractEmails("<html><body>電話は 072-000-0000</body></html>", "https://x.jp/"), []);
});
