"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/member";
import { createAdmin } from "@/lib/supabase/admin";
import { purchaseTickets } from "@/lib/frank-tickets";
import { logEvent } from "@/lib/kernel";

type Row = Record<string, unknown>;

/** 会員ポータルからのチケット購入（#199） */
export async function buyTickets(formData: FormData) {
  const member = await requireMember();
  const admin = createAdmin();

  const { data: m } = await admin
    .from("frunk_members")
    .select("id, company_id, store_id, square_customer_id, status")
    .eq("company_id", member.companyId)
    .eq("member_no", member.memberNo)
    .is("deleted_at", null)
    .maybeSingle();
  if (!m) redirect("/member/tickets?err=" + encodeURIComponent("会員が見つかりません"));
  const mem = m as Row;

  const result = await purchaseTickets({
    companyId: member.companyId,
    memberId: String(mem.id),
    memberNo: member.memberNo,
    storeId: (mem.store_id as string | null) ?? null,
    squareCustomerId: (mem.square_customer_id as string | null) ?? null,
    qty: Number(formData.get("qty") ?? 1),
  });

  if (!result.ok) redirect("/member/tickets?err=" + encodeURIComponent(result.message));

  await logEvent(member.companyId, {
    event_type: "frank.ticket.purchased",
    title: `レッスンチケット${result.qty}枚: ${member.name} 様 ¥${result.amount.toLocaleString("ja-JP")}（${result.paid ? "カード決済済" : "店頭でお支払い"}）`,
    source: "web",
    source_type: "external",
    severity: result.paid ? "info" : "notice",
    amount: result.amount,
  });

  redirect("/member/tickets?msg=" + encodeURIComponent(result.message));
}
