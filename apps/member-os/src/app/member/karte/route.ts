import { NextResponse } from "next/server";
import { getMemberSession } from "@/lib/member";
import { createAdmin } from "@/lib/supabase/admin";
import { karteShareUrl } from "@/lib/frank-portal";

export const dynamic = "force-dynamic";

/**
 * レッスンカルテを開く（#155）
 *
 * 直接 lesson-os の共有URLへリンクせず、ここを通す理由は2つ:
 *   1. 「ここまでは見た」を記録する（frunk_members.karte_seen_at）→ 次に更新されたら新着バッジが出る
 *   2. 共有トークンをホーム画面のHTMLに埋めない（押した人にだけ渡す）
 */
export async function GET(req: Request) {
  const session = await getMemberSession();
  if (!session) return NextResponse.redirect(new URL("/member/login", req.url));

  const admin = createAdmin();
  const { data: me } = await admin
    .from("frunk_members").select("id")
    .eq("company_id", session.companyId).eq("member_no", session.memberNo)
    .is("deleted_at", null).maybeSingle();

  const url = await karteShareUrl(session.companyId, session.memberNo);
  if (me) {
    await admin.from("frunk_members")
      .update({ karte_seen_at: new Date().toISOString() })
      .eq("id", (me as { id: string }).id);
  }
  return NextResponse.redirect(url ? new URL(url) : new URL("/member", req.url));
}
