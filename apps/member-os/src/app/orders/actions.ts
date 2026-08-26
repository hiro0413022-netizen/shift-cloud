"use server";

import { revalidatePath } from "next/cache";
import { requireReceptionActor } from "@/lib/auth";
import { canAccessFrank, requireStoreAccess, FRANK_STORE_ID } from "@/lib/store-scope";
import { createAdmin } from "@/lib/supabase/admin";
import { placeOrder, loadMenu } from "@/lib/frank-portal";
import { unitPriceOf } from "@yozan/core/frank-portal";
import { chargeOrderOnFile } from "@/lib/frank-square";
import { logEvent } from "@/lib/kernel";

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

/** 電子伝票の操作は全部ここを通る。UIの出し分けではなくサーバー側で店舗を検証する（#134）。 */
async function guard() {
  const actor = await requireReceptionActor();
  if (!canAccessFrank(actor)) throw new Error("FORBIDDEN: frank");
  requireStoreAccess(actor, FRANK_STORE_ID);
  return actor;
}

/** 作って持っていった */
export async function markServed(formData: FormData) {
  const actor = await guard();
  const id = s(formData.get("id"));
  if (!id) return;
  const admin = createAdmin();
  await admin.from("frunk_orders")
    .update({ status: "served", served_at: new Date().toISOString(), served_by: actor.staffId })
    .eq("id", id).is("deleted_at", null);
  revalidatePath("/orders");
}

/** 取消（誤注文）。決済済みの返金はSquare側で行う＝ここでは伝票を落とすだけ。 */
export async function cancelOrder(formData: FormData) {
  await guard();
  const id = s(formData.get("id"));
  if (!id) return;
  const admin = createAdmin();
  await admin.from("frunk_orders").update({ status: "cancelled" }).eq("id", id).is("deleted_at", null);
  revalidatePath("/orders");
}

/**
 * 口頭で受けた注文を伝票に足す（#154 / 構想 §4）。
 *
 * 既存の伝票に明細を継ぎ足すのではなく **同じ打席・同じ会員で新しい伝票を1枚立てる**。
 * 理由: 会員の注文は1件ごとにカード決済が走っているので、あとから明細だけ増やすと
 * 「決済済みの金額」と「伝票の合計」がずれる。1注文=1決済を崩さない。
 * 画面上は同じ打席のグループにまとまって見えるので、スタッフの体感は「追加」のまま。
 */
export async function addStaffOrder(formData: FormData) {
  await guard();
  const admin = createAdmin();
  const bayId = s(formData.get("bay_id")) || null;
  const memberId = s(formData.get("member_id")) || null;
  const menuItemId = s(formData.get("menu_item_id"));
  const qty = Math.max(1, Math.min(20, Number(formData.get("qty") ?? 1)));
  if (!menuItemId) return;

  const { data: store } = await admin.from("stores").select("id, company_id").eq("code", "frunk_himeji").maybeSingle();
  if (!store) return;
  const companyId = s((store as Row).company_id);

  const menu = await loadMenu(companyId);
  const item = menu.find((m) => m.id === menuItemId);
  if (!item) return;

  let member: { id: string; memberNo: string; squareCustomerId: string | null } | null = null;
  if (memberId) {
    const { data: m } = await admin
      .from("frunk_members").select("id, member_no, square_customer_id")
      .eq("id", memberId).is("deleted_at", null).maybeSingle();
    if (m) member = { id: s((m as Row).id), memberNo: s((m as Row).member_no), squareCustomerId: ((m as Row).square_customer_id as string | null) ?? null };
  }

  let bayLabel: string | null = null;
  if (bayId) {
    const { data: b } = await admin.from("frunk_bays").select("name").eq("id", bayId).maybeSingle();
    bayLabel = s((b as Row | null)?.name) || null;
  }

  const r = await placeOrder({
    companyId, storeId: s((store as Row).id), bayId,
    member, checkinId: null, guestLabel: member ? null : bayLabel,
    lines: [{ item, qty }], source: "staff",
  });
  if (r.ok) {
    await logEvent(companyId, {
      event_type: "frank.order.placed",
      title: `口頭注文 ${r.orderNo}: ${member?.memberNo ?? bayLabel ?? "ビジター"} ¥${r.total.toLocaleString("ja-JP")}（${r.paid ? "決済済" : "未決済"}）`,
      source: "reception", source_type: "human", severity: "info", amount: r.total,
    });
  }
  revalidatePath("/orders");
}

/**
 * ビジターとして入った注文を会員に紐付け直す（#154 / 構想 §6-2）。
 *
 * セッションが切れている会員が打席QRから一般価格で注文してしまったときの保険。
 * 会員価格に引き直したうえで、カードがあればその場で決済する。
 * 未決済の伝票にだけ効かせる（決済済みに触ると返金が必要になり、現場で扱えない）。
 */
export async function linkOrderToMember(formData: FormData) {
  await guard();
  const orderId = s(formData.get("id"));
  const memberId = s(formData.get("member_id"));
  if (!orderId || !memberId) return;
  const admin = createAdmin();

  const { data: o } = await admin
    .from("frunk_orders").select("id, company_id, order_no, payment_status, member_id")
    .eq("id", orderId).is("deleted_at", null).maybeSingle();
  if (!o || s((o as Row).payment_status) !== "unpaid" || s((o as Row).member_id)) return;

  const { data: m } = await admin
    .from("frunk_members").select("id, member_no, square_customer_id")
    .eq("id", memberId).is("deleted_at", null).maybeSingle();
  if (!m) return;

  // 明細を会員価格に引き直す
  const { data: items } = await admin
    .from("frunk_order_items").select("id, menu_item_id, qty").eq("order_id", orderId);
  const menu = await loadMenu(s((o as Row).company_id));
  let total = 0;
  for (const it of ((items ?? []) as Row[])) {
    const mi = menu.find((x) => x.id === s(it.menu_item_id));
    if (!mi) continue;
    const unit = unitPriceOf(mi, "member");
    const amount = unit * n(it.qty);
    total += amount;
    await admin.from("frunk_order_items").update({ price_kind: "member", unit_price: unit, amount }).eq("id", s(it.id));
  }

  await admin.from("frunk_orders").update({ member_id: memberId, guest_label: null, amount: total }).eq("id", orderId);

  const customerId = ((m as Row).square_customer_id as string | null) ?? null;
  if (customerId && total > 0) {
    const r = await chargeOrderOnFile({
      customerId, amountTaxIncluded: total,
      note: `FRANKオーダー#${s((o as Row).order_no)}`,
      idempotencyKey: orderId,
    });
    await admin.from("frunk_orders")
      .update(r.ok ? { payment_status: "paid", square_payment_id: r.paymentId ?? null } : { payment_status: "unpaid", payment_error: r.error ?? null })
      .eq("id", orderId);
  }
  revalidatePath("/orders");
}
