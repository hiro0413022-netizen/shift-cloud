import { NextRequest, NextResponse } from "next/server";
import { verifyStripeSignature, handleStripeEvent } from "@/lib/frank-billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stripe Webhook（FRANK GOLF 月会費 #97）
 * Stripeダッシュボード側の登録先: https://yozan-genesis.vercel.app/api/public/frank/billing/webhook
 * 対象イベント: checkout.session.completed / invoice.payment_failed / customer.subscription.deleted
 * ※ /api/public 配下なので middleware の公開パス登録は不要（#90の再発なし）
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });

  const payload = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!verifyStripeSignature(payload, sig, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    await handleStripeEvent(payload);
  } catch (e) {
    console.error("[frank-billing] webhook failed:", e);
    // Stripeに再送させる
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
