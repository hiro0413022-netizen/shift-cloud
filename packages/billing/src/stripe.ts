// @yozan/billing/stripe — Stripe RESTの薄いラッパ（SDKなし・依存追加なし）。
// 切り出し元: apps/genesis/src/lib/frank-billing.ts（FRANK月会費 #97 / migration 0087）。
// frunk_members等のDB更新はアプリ側の責務（このパッケージはStripeとの往復だけを持つ）。
//
// 環境変数はアプリ側で読む（STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET）。
// テスト→本番は sk_test → sk_live の差し替えのみ（FRANKのsk_live差替え時にこの経路を使う）。

import { createHmac, timingSafeEqual } from "crypto";

const STRIPE_API = "https://api.stripe.com/v1";

/** sk_ で始まる鍵だけを有効とみなす（未設定はnull＝店頭案内などにフォールバック） */
export function stripeSecretKey(env: string | undefined = process.env.STRIPE_SECRET_KEY): string | null {
  return env && env.startsWith("sk_") ? env : null;
}

export async function stripePost(
  key: string,
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error as { message?: string } | undefined)?.message ?? `Stripe API error (${res.status})`;
    throw new Error(err);
  }
  return json;
}

// ------------------------------------------------------------------
// Checkout（継続課金）
// ------------------------------------------------------------------

export type SubscriptionCheckoutOptions = {
  customerId: string;
  /** 税込・円 */
  amountJpy: number;
  /** 例: "FRANK GOLF 月会費（レギュラー・税込）" */
  productName: string;
  successUrl: string;
  cancelUrl: string;
  /** session と subscription の両方に付く */
  metadata?: Record<string, string>;
  clientReferenceId?: string;
};

/** Checkout(mode=subscription) のパラメータを組み立てる（純粋関数・テスト対象） */
export function buildSubscriptionCheckoutParams(o: SubscriptionCheckoutOptions): Record<string, string> {
  const params: Record<string, string> = {
    mode: "subscription",
    customer: o.customerId,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "jpy",
    "line_items[0][price_data][unit_amount]": String(Math.round(o.amountJpy)),
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][product_data][name]": o.productName,
    success_url: o.successUrl,
    cancel_url: o.cancelUrl,
    locale: "ja",
  };
  if (o.clientReferenceId) params.client_reference_id = o.clientReferenceId;
  for (const [k, v] of Object.entries(o.metadata ?? {})) {
    params[`metadata[${k}]`] = v;
    params[`subscription_data[metadata][${k}]`] = v;
  }
  return params;
}

/** Checkout URL を返す */
export async function createSubscriptionCheckout(
  key: string,
  o: SubscriptionCheckoutOptions,
): Promise<{ id: string; url: string }> {
  const session = await stripePost(key, "/checkout/sessions", buildSubscriptionCheckoutParams(o));
  return { id: String(session.id), url: String(session.url) };
}

export type CustomerOptions = {
  name: string;
  email?: string | null;
  phone?: string | null;
  metadata?: Record<string, string>;
};

/** Stripe顧客の作成。既存customerIdの再利用判断はアプリ側で。 */
export async function createStripeCustomer(key: string, o: CustomerOptions): Promise<string> {
  const params: Record<string, string> = { name: o.name };
  if (o.email) params.email = o.email;
  if (o.phone) params.phone = o.phone;
  for (const [k, v] of Object.entries(o.metadata ?? {})) params[`metadata[${k}]`] = v;
  const customer = await stripePost(key, "/customers", params);
  return String(customer.id);
}

// ------------------------------------------------------------------
// Webhook署名検証（frank-billing.ts から逐語）
// ------------------------------------------------------------------

/** Stripe-Signature ヘッダの検証（t=..,v1=.. / HMAC-SHA256、許容ずれ5分） */
export function verifyStripeSignature(payload: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader) return false;
  const parts = new Map(sigHeader.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

// @yozan/billing/webhook — Stripe Webhookルートの共通形。
// 切り出し元: apps/genesis/src/app/api/public/frank/billing/webhook/route.ts。
// イベントごとのDB更新（frunk_members等）は onEvent でアプリ側が行う。
//
// 使い方（Next.js route.ts）:
//   export const dynamic = "force-dynamic";
//   export const runtime = "nodejs";
//   export const POST = createStripeWebhookHandler({ onEvent: handleStripeEvent });
//
// ⚠ /api/public 配下に置けば middleware の公開パス登録は不要（#90の再発なし）。
//   それ以外に置く場合は公開パス登録を忘れないこと。


export type StripeEvent = { type: string; data: { object: Record<string, unknown> } };

export type WebhookOptions = {
  /** 既定: process.env.STRIPE_WEBHOOK_SECRET */
  getSecret?: () => string | undefined;
  /** 署名検証済みのイベントを処理する（throwするとStripeに再送させる） */
  onEvent: (event: StripeEvent, payload: string) => Promise<void>;
  /** ログ接頭辞。既定 "[billing]" */
  logPrefix?: string;
};

export function createStripeWebhookHandler(opts: WebhookOptions): (req: Request) => Promise<Response> {
  const getSecret = opts.getSecret ?? (() => process.env.STRIPE_WEBHOOK_SECRET);
  const prefix = opts.logPrefix ?? "[billing]";
  return async (req: Request) => {
    const secret = getSecret();
    if (!secret) return Response.json({ error: "webhook not configured" }, { status: 503 });

    const payload = await req.text();
    const sig = req.headers.get("stripe-signature");
    if (!verifyStripeSignature(payload, sig, secret)) {
      return Response.json({ error: "invalid signature" }, { status: 400 });
    }

    try {
      const event = JSON.parse(payload) as StripeEvent;
      await opts.onEvent(event, payload);
    } catch (e) {
      console.error(`${prefix} webhook failed:`, e);
      // Stripeに再送させる
      return Response.json({ error: "handler failed" }, { status: 500 });
    }
    return Response.json({ received: true });
  };
}
