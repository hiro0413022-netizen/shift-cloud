import { NextRequest, NextResponse } from "next/server";
import { createBillingCheckout } from "@/lib/frank-billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * FRANK GOLF 月会費の継続課金 公開API（#97）
 * POST {member_no, phone_last4} … Stripe Checkout のURLを返す
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "JSONが不正です" }, { status: 400, headers: CORS });
  }
  const r = await createBillingCheckout(String(body.member_no ?? ""), String(body.phone_last4 ?? ""));
  return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
