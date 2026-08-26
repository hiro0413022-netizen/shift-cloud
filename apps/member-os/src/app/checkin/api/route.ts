import { NextResponse } from "next/server";
import { requireReceptionActor } from "@/lib/auth";
import { canAccessFrank } from "@/lib/store-scope";
import { createAdmin } from "@/lib/supabase/admin";
import { checkInByToken, checkInMember, assignBay } from "@/lib/frank-portal";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

/**
 * 受付チェックインの唯一の入口（#154）。
 *
 * ★ 「トークンの受け口を1本にする」の実体はここ。
 *   いまは受付PCのバーコードリーダーが USB HIDキーボードとして入力欄に文字を打ち、
 *   画面がこのエンドポイントに POST している。
 *   将来リーダーを **仮想COM（Web Serial）** に切り替えても、
 *   読み取った文字列をこの同じ POST に渡すだけでよい。
 *   DB・業務ロジック・表示は一切変えない（構想 §2）。
 */
export async function POST(req: Request) {
  const actor = await requireReceptionActor();
  if (!canAccessFrank(actor)) return NextResponse.json({ ok: false, message: "権限がありません" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Row;
  const action = String(body.action ?? "scan");

  if (action === "scan") {
    // 卓上リーダーは目の前のものを何でも読む。形式が違うものは checkInByToken 側で捨てられる。
    return NextResponse.json(await checkInByToken(String(body.token ?? ""), "qr"));
  }

  if (action === "search") {
    const q = String(body.q ?? "").trim();
    if (q.length < 1) return NextResponse.json({ rows: [] });
    const admin = createAdmin();
    const like = `%${q}%`;
    const { data } = await admin
      .from("frunk_members")
      .select("id, member_no, name, name_kana, phone, status")
      .is("deleted_at", null)
      .in("status", ["active", "approved", "suspended"])
      .or(`name.ilike.${like},name_kana.ilike.${like},member_no.ilike.${like},phone.ilike.${like}`)
      .order("member_no", { ascending: true })
      .limit(12);
    return NextResponse.json({ rows: data ?? [] });
  }

  if (action === "manual") {
    // リーダー故障・スマホ忘れ・ログイン不能の逃げ道。これが無いと受付が止まる。
    return NextResponse.json(await checkInMember(String(body.memberId ?? ""), "manual"));
  }

  if (action === "assign") {
    await assignBay(String(body.checkinId ?? ""), String(body.bayId ?? ""));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, message: "unknown action" }, { status: 400 });
}
