import { NextRequest, NextResponse } from "next/server";
import { getSlots, createBooking, listMyBookings, cancelBooking } from "@/lib/frank-booking";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * FRANK GOLF 予約 公開API（#86 §3-3）
 * GET  ?date=YYYY-MM-DD               … 空き状況
 * GET  ?my=1&member_no&phone_last4    … 自分の予約一覧
 * POST {action:'book', ...}           … 予約作成
 * POST {action:'cancel', ...}         … キャンセル
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("my")) {
    const res = await listMyBookings(String(sp.get("member_no") ?? ""), String(sp.get("phone_last4") ?? ""));
    if (!res) return NextResponse.json({ error: "認証に失敗しました" }, { status: 401, headers: CORS });
    return NextResponse.json(res, { headers: CORS });
  }
  const date = String(sp.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date必須" }, { status: 400, headers: CORS });
  return NextResponse.json(await getSlots(date), { headers: CORS });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSONが不正です" }, { status: 400, headers: CORS });
  }
  const action = String(body.action ?? "book");
  if (action === "cancel") {
    const r = await cancelBooking(String(body.member_no ?? ""), String(body.phone_last4 ?? ""), String(body.booking_id ?? ""));
    return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: CORS });
  }
  const r = await createBooking({
    memberNo: String(body.member_no ?? ""),
    phoneLast4: String(body.phone_last4 ?? ""),
    date: String(body.date ?? ""),
    bayCode: String(body.bay_code ?? ""),
    start: String(body.start ?? ""),
    minutes: Number(body.minutes ?? 60),
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
