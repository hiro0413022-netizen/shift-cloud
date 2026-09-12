import { NextRequest, NextResponse } from "next/server";
import { verifyAdminPayload } from "@yozan/core/admin-sign";
import { rebaseToBillingDay } from "@/lib/frank-billing-day";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 月会費を「毎月10日に翌月分」に作り直す（#235）
 * POST {payload: JSON文字列 {member_id, usage_start?, bulk?}, exp, sig}
 *
 * ⚠ 会員IDだけの認可にしない。会員IDはお客様の入会完了画面のURL（?sid=）に出ているので、
 *   ご利用開始日を後ろにずらす（＝月会費を先送りする）操作をお客様自身が叩けてしまう。
 *   member-os からのサーバー呼び出しだけを通す（@yozan/core/admin-sign・領収書#222と同じ署名）。
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const payload = String(body.payload ?? "");
  const exp = Number(body.exp ?? 0);
  const sig = String(body.sig ?? "");
  if (!verifyAdminPayload(payload, exp, sig)) {
    return NextResponse.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }
  let p: Record<string, unknown>;
  try {
    p = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_payload" }, { status: 400 });
  }
  const memberId = String(p.member_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) {
    return NextResponse.json({ ok: false, error: "bad_member_id" }, { status: 400 });
  }
  const usageStart = typeof p.usage_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.usage_start) ? p.usage_start : null;
  const r = await rebaseToBillingDay(memberId, { source: p.bulk === true ? "bulk" : "staff", usageStart });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
