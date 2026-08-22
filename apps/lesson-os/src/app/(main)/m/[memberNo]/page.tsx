import { notFound, redirect } from "next/navigation";
import { requireLessonActor, canAccessStore } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * 会員番号でカルテを開く（2026-08-22 ユーザー依頼）
 *
 *   /m/FR0003  →  /students/<カルテID>
 *
 * 予約システム（member-os）のカレンダーから1タップで飛べるようにするための入口。
 * 呼ぶ側はカルテIDを知らなくてよい＝member-os が lsn_students を引く必要がない。
 *
 * カルテが無ければその場で作る（find-or-create）。
 * 通常は 0119 のトリガーが入会時に作っているので通らないが、
 * 過去データや取込で漏れた会員をコーチの前で止めないための保険。
 */
export const dynamic = "force-dynamic";

export default async function OpenByMemberNo({ params }: { params: Promise<{ memberNo: string }> }) {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const memberNo = decodeURIComponent((await params).memberNo).trim().slice(0, 40);
  if (!memberNo) notFound();

  const { data: found } = await admin
    .from("lsn_students")
    .select("id, store_id")
    .eq("company_id", actor.companyId)
    .eq("member_code", memberNo)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (found) {
    const row = found as { id: string; store_id: string | null };
    // URL直打ちで他店舗のカルテを開けないようにする（#134）
    if (!canAccessStore(actor, row.store_id)) notFound();
    redirect(`/students/${row.id}`);
  }

  // カルテが無い → FRANK会員名簿から作る
  const { data: member } = await admin
    .from("frunk_members")
    .select("name, name_kana, store_id, status")
    .eq("company_id", actor.companyId)
    .eq("member_no", memberNo)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!member) notFound();
  const m = member as { name: string | null; name_kana: string | null; store_id: string | null; status: string };
  if (!canAccessStore(actor, m.store_id)) notFound();

  const { data: created } = await admin
    .from("lsn_students")
    .insert({
      company_id: actor.companyId,
      store_id: m.store_id,
      name: (m.name ?? "").trim() || memberNo,
      name_kana: (m.name_kana ?? "").trim() || null,
      member_code: memberNo,
      memo: "予約カレンダーから開いたときに自動作成",
      status: m.status === "active" || m.status === "suspended" ? "active" : "inactive",
    })
    .select("id")
    .single();
  if (!created) notFound();
  redirect(`/students/${(created as { id: string }).id}`);
}
