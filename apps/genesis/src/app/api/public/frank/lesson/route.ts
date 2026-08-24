import { NextRequest, NextResponse } from "next/server";
import { listOpenLessonSlots, bookLesson, listMyLessons, cancelLesson } from "@/lib/frank-lesson";
import type { MemberAuth } from "@/lib/frank-booking";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // 引き渡しトークンの検証に node:crypto を使う（#152）

/** 会員番号＋電話下4桁、または会員ポータルからの引き渡しトークン t（#152） */
function authOf(get: (k: string) => string): MemberAuth {
  return { memberNo: get("member_no"), phoneLast4: get("phone_last4"), token: get("t") };
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * FRANK GOLF レッスン予約 公開API（#88 §3-4）
 * GET                                 … 公開中の枠一覧（30日先まで・未予約のみ）
 * GET  ?my=1&member_no&phone_last4    … 自分のレッスン予約一覧（t=引き渡しトークンでも可・#152）
 * POST {action:'book', slot_id, ...}  … 予約作成（カルテ自動生成）
 * POST {action:'cancel', booking_id}  … キャンセル
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("my")) {
    const res = await listMyLessons(authOf((k) => String(sp.get(k) ?? "")));
    if (!res) return NextResponse.json({ error: "認証に失敗しました" }, { status: 401, headers: CORS });
    return NextResponse.json(res, { headers: CORS });
  }
  return NextResponse.json(await listOpenLessonSlots(), { headers: CORS });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSONが不正です" }, { status: 400, headers: CORS });
  }
  const auth = authOf((k) => String(body[k] ?? ""));
  const action = String(body.action ?? "book");
  if (action === "cancel") {
    const r = await cancelLesson(auth, String(body.booking_id ?? ""));
    return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: CORS });
  }
  const r = await bookLesson({ auth, slotId: String(body.slot_id ?? "") });
  return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
