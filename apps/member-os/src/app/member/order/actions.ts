"use server";

import { redirect } from "next/navigation";
import { requireMember } from "@/lib/member";
import { createAdmin } from "@/lib/supabase/admin";
import { placeOrder, loadMenu, currentVisit, bayByCode } from "@/lib/frank-portal";
import { logEvent } from "@/lib/kernel";
import type { OrderLineInput } from "@yozan/core/frank-portal";

type Row = Record<string, unknown>;

/**
 * 会員ポータルからの注文（#154）。
 * 会計は「注文＝即決済」。カード未保存・決済失敗でも注文は止めず、未決済として伝票に出す。
 */
export async function submitOrder(formData: FormData) {
  const member = await requireMember();
  const admin = createAdmin();

  const { data: m } = await admin
    .from("frunk_members").select("id, company_id, store_id, square_customer_id")
    .eq("company_id", member.companyId).eq("member_no", member.memberNo)
    .is("deleted_at", null).maybeSingle();
  if (!m) redirect("/member?err=" + encodeURIComponent("会員が見つかりません"));
  const mem = m as Row;
  const memberId = String(mem.id);

  const visit = await currentVisit(memberId);
  const bayCodeParam = String(formData.get("bay") ?? "");
  const bay = bayCodeParam ? await bayByCode(bayCodeParam) : null;
  const bayId = bay?.id ?? visit.bayId;

  const menu = await loadMenu(member.companyId);
  const lines: OrderLineInput[] = [];
  for (const item of menu) {
    const qty = Number(formData.get(`q_${item.id}`) ?? 0);
    if (qty > 0) lines.push({ item, qty });
  }
  if (lines.length === 0) {
    redirect(`/member/order${bayCodeParam ? `?bay=${encodeURIComponent(bayCodeParam)}` : ""}&err=1`);
  }

  const result = await placeOrder({
    companyId: member.companyId,
    storeId: String(mem.store_id ?? "") || (bay ? bay.companyId : ""),
    bayId,
    member: { id: memberId, memberNo: member.memberNo, squareCustomerId: (mem.square_customer_id as string | null) ?? null },
    checkinId: visit.checkinId,
    guestLabel: null,
    lines,
    source: bayCodeParam ? "bay" : "portal",
  });

  if (!result.ok) redirect("/member?err=" + encodeURIComponent(result.message));

  await logEvent(member.companyId, {
    event_type: "frank.order.placed",
    title: `モバイルオーダー ${result.orderNo}: ${member.name} 様 ¥${result.total.toLocaleString("ja-JP")}（${result.paid ? "決済済" : "未決済"}）`,
    source: "web", source_type: "external", severity: "info", amount: result.total,
  });

  redirect("/member?ordered=" + encodeURIComponent(result.message));
}
