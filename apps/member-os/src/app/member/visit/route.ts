import { NextResponse } from "next/server";
import { getMemberSession } from "@/lib/member";
import { currentVisit } from "@/lib/frank-portal";
import { createAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * 来店中かどうかを会員のスマホに返す（#154）。
 * `/member` は middleware の publicPrefixes に入っているので、認可はここで自分で行う。
 * 返すのは自分の来店状態だけ（会員セッション必須・他人のIDは受け取らない）。
 */
export async function GET() {
  const session = await getMemberSession();
  if (!session) return NextResponse.json({ checkedIn: false, bayName: null, bayCode: null, endTime: null });

  const admin = createAdmin();
  const { data: me } = await admin
    .from("frunk_members").select("id")
    .eq("company_id", session.companyId).eq("member_no", session.memberNo)
    .is("deleted_at", null).maybeSingle();
  if (!me) return NextResponse.json({ checkedIn: false, bayName: null, bayCode: null, endTime: null });

  const v = await currentVisit((me as { id: string }).id);
  return NextResponse.json(
    { checkedIn: v.checkedIn, bayName: v.bayName, bayCode: v.bayCode, endTime: v.endTime },
    { headers: { "Cache-Control": "no-store" } },
  );
}
