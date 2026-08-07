import { NextRequest, NextResponse } from "next/server";
import { verifySquareSignature, handleSquareEvent, DEFAULT_WEBHOOK_URL } from "@/lib/frank-pos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Square Webhook（FRANK GOLF 店頭POS #118 / 実行計画§3-7）
 * Square Developer ダッシュボード側の登録先:
 *   https://yozan-genesis.vercel.app/api/public/frank/pos/webhook
 * 対象イベント: payment.created / payment.updated / refund.created / refund.updated
 * ※ /api/public 配下なので middleware の公開パス登録は不要（#90の再発なし）
 */
export async function POST(req: NextRequest) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });

  const payload = await req.text();
  const sig = req.headers.get("x-square-hmacsha256-signature");
  const url = process.env.SQUARE_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;
  if (!verifySquareSignature(payload, sig, key, url)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    await handleSquareEvent(payload);
  } catch (e) {
    console.error("[frank-pos] webhook failed:", e);
    // Squareに再送させる
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
