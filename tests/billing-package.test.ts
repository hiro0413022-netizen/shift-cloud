// @yozan/billing（MODULARIZATION_PLAN ②）のテスト。
// お金に直結するので、署名検証とCheckoutパラメータ組み立て（＝Stripeに送る値）を固定する。
// fetchを呼ぶ関数はテストしない方針だが、#113の教訓どおり「外部に出ていく値の組み立て」までは固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  stripeSecretKey,
  buildSubscriptionCheckoutParams,
  verifyStripeSignature,
  createStripeWebhookHandler,
} from "../packages/billing/src/stripe.ts";
// 注: 切り出し元 apps/genesis/src/lib/frank-billing.ts は "server-only" と "@/" aliasを含むため
// node --test から直接importできない。verifyStripeSignatureは逐語コピーであり、ここで挙動を固定する。

const SECRET = "whsec_test_secret";

function sign(payload: string, secret = SECRET, at = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${at}.${payload}`).digest("hex");
  return `t=${at},v1=${v1}`;
}

test("署名検証: 正しい署名は通る", () => {
  const payload = JSON.stringify({ type: "checkout.session.completed" });
  assert.equal(verifyStripeSignature(payload, sign(payload), SECRET), true);
});

test("署名検証: 改ざん・鍵違い・ヘッダ無し・5分超過は弾く", () => {
  const payload = "{}";
  assert.equal(verifyStripeSignature(payload + "x", sign(payload), SECRET), false);
  assert.equal(verifyStripeSignature(payload, sign(payload, "whsec_other"), SECRET), false);
  assert.equal(verifyStripeSignature(payload, null, SECRET), false);
  const old = sign(payload, SECRET, Math.floor(Date.now() / 1000) - 600);
  assert.equal(verifyStripeSignature(payload, old, SECRET), false);
});

test("Checkoutパラメータ: FRANK月会費と同じ形になる（jpy・月次・ja・metadata二重付与）", () => {
  const p = buildSubscriptionCheckoutParams({
    customerId: "cus_123",
    amountJpy: 8800,
    productName: "FRANK GOLF 月会費（レギュラー・税込）",
    successUrl: "https://frankgolf.jp/booking.html?billing=success",
    cancelUrl: "https://frankgolf.jp/booking.html?billing=cancel",
    clientReferenceId: "member-uuid",
    metadata: { frunk_member_id: "member-uuid" },
  });
  assert.equal(p.mode, "subscription");
  assert.equal(p.customer, "cus_123");
  assert.equal(p["line_items[0][price_data][currency]"], "jpy");
  assert.equal(p["line_items[0][price_data][unit_amount]"], "8800");
  assert.equal(p["line_items[0][price_data][recurring][interval]"], "month");
  assert.equal(p.locale, "ja");
  assert.equal(p.client_reference_id, "member-uuid");
  // metadataはsessionとsubscriptionの両方に付く（webhookでの会員逆引きに必要）
  assert.equal(p["metadata[frunk_member_id]"], "member-uuid");
  assert.equal(p["subscription_data[metadata][frunk_member_id]"], "member-uuid");
  // 端数は四捨五入で整数円
  assert.equal(buildSubscriptionCheckoutParams({
    customerId: "c", amountJpy: 1099.6, productName: "n", successUrl: "s", cancelUrl: "c2",
  })["line_items[0][price_data][unit_amount]"], "1100");
});

test("鍵の検査: sk_のみ有効・未設定はnull（店頭案内フォールバック用）", () => {
  assert.equal(stripeSecretKey("sk_test_abc"), "sk_test_abc");
  assert.equal(stripeSecretKey("pk_test_abc"), null);
  assert.equal(stripeSecretKey(undefined), null);
});

test("Webhookハンドラ: secret未設定503・署名不正400・成功200・handler失敗500(再送)", async () => {
  const events: string[] = [];
  const make = (secret?: string, fail = false) =>
    createStripeWebhookHandler({
      getSecret: () => secret,
      onEvent: async (ev) => {
        if (fail) throw new Error("boom");
        events.push(ev.type);
      },
    });
  const payload = JSON.stringify({ type: "invoice.payment_failed", data: { object: {} } });
  const req = (sig: string | null) =>
    new Request("https://x.example/api/public/frank/billing/webhook", {
      method: "POST",
      body: payload,
      headers: sig ? { "stripe-signature": sig } : {},
    });

  assert.equal((await make(undefined)(req(sign(payload)))).status, 503);
  assert.equal((await make(SECRET)(req(null))).status, 400);
  assert.equal((await make(SECRET)(req(sign(payload, "whsec_other")))).status, 400);
  const ok = await make(SECRET)(req(sign(payload)));
  assert.equal(ok.status, 200);
  assert.deepEqual(events, ["invoice.payment_failed"]);
  assert.equal((await make(SECRET, true)(req(sign(payload)))).status, 500);
});
