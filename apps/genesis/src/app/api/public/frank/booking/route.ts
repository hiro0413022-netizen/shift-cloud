import { NextRequest, NextResponse } from "next/server";
import { getSlots, createBooking, listMyBookings, cancelBooking, authMember, type MemberAuth } from "@/lib/frank-booking";
import { createAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // 引き渡しトークンの検証に node:crypto を使う（#152）

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * FRANK GOLF 予約 公開API（#86 §3-3）
 * GET  ?date=YYYY-MM-DD               … 空き状況
 * GET  ?my=1&member_no&phone_last4    … 自分の予約一覧
 * GET  ?my=1&t=<引き渡しトークン>      … 同上（会員ポータルからの遷移・#152）
 * GET  ?me=1&t=<引き渡しトークン>      … トークンの持ち主（氏名）を返す。ページの挨拶表示用
 * POST {action:'book', ...}           … 予約作成（lesson:true で25分パーソナルレッスンを希望）
 * POST {action:'cancel', ...}         … キャンセル
 *
 * 認証は「会員番号＋電話番号下4桁」が基本。会員ポータルにログイン済みのお客様は
 * 署名付きトークン t を持って来るので、それがあれば再入力を求めない（#152）。
 */
function authOf(get: (k: string) => string): MemberAuth {
  return { memberNo: get("member_no"), phoneLast4: get("phone_last4"), token: get("t") };
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const get = (k: string) => String(sp.get(k) ?? "");

  if (sp.get("me")) {
    const m = await authMember(createAdmin(), authOf(get));
    if (!m) return NextResponse.json({ ok: false, error: "認証に失敗しました" }, { status: 401, headers: CORS });
    return NextResponse.json({ ok: true, name: m.name, member_no: m.member_no }, { headers: CORS });
  }
  if (sp.get("my")) {
    const res = await listMyBookings(authOf(get));
    if (!res) return NextResponse.json({ error: "認証に失敗しました" }, { status: 401, headers: CORS });
    return NextResponse.json(res, { headers: CORS });
  }
  const date = get("date");
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
  const get = (k: string) => String(body[k] ?? "");
  const auth = authOf(get);
  const action = String(body.action ?? "book");
  if (action === "cancel") {
    const r = await cancelBooking(auth, String(body.booking_id ?? ""));
    return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: CORS });
  }
  const r = await createBooking({
    auth,
    date: String(body.date ?? ""),
    bayCode: String(body.bay_code ?? ""),
    start: String(body.start ?? ""),
    minutes: Number(body.minutes ?? 60),
    lesson: body.lesson === true || body.lesson === "1",
    lessonStaffId: typeof body.lesson_staff_id === "string" && body.lesson_staff_id ? body.lesson_staff_id : null,
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
