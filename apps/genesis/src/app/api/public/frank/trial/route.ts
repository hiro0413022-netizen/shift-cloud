import { NextRequest, NextResponse } from "next/server";
import { getTrialSlots, createTrialBooking, getTrialByToken, cancelTrialByToken } from "@/lib/frank-trial";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * FRANK GOLF 体験のセルフ予約 公開API（0083）
 * GET  ?date=YYYY-MM-DD      … その日の空き時刻（右打ち用・レフティ用）
 * GET  ?token=xxx            … キャンセル画面用に予約内容を引く
 * POST {action:'book', ...}  … 体験を即時確定（打席は自動割当）
 * POST {action:'cancel', token} … お客様によるキャンセル
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const token = sp.get("token");
  if (token) {
    const found = await getTrialByToken(String(token));
    if (!found) return NextResponse.json({ error: "ご予約が見つかりません" }, { status: 404, headers: CORS });
    return NextResponse.json(found, { headers: CORS });
  }

  const date = String(sp.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date必須" }, { status: 400, headers: CORS });
  }
  return NextResponse.json(await getTrialSlots(date), { headers: CORS });
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
    const r = await cancelTrialByToken(String(body.token ?? ""));
    return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: CORS });
  }

  const r = await createTrialBooking({
    name: String(body.name ?? ""),
    nameKana: body.name_kana ? String(body.name_kana) : undefined,
    phone: body.phone ? String(body.phone) : undefined,
    email: body.email ? String(body.email) : undefined,
    date: String(body.date ?? ""),
    start: String(body.start ?? ""),
    lefty: Boolean(body.lefty),
    experience: body.experience ? String(body.experience) : undefined,
    message: body.message ? String(body.message) : undefined,
    consent: Boolean(body.consent),
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
