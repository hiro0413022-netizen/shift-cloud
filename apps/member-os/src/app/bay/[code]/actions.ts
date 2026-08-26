"use server";

import { redirect } from "next/navigation";
import { resolveHimeji } from "@/lib/member";
import { bayByCode, loadMenu, placeOrder } from "@/lib/frank-portal";
import { logEvent } from "@/lib/kernel";
import type { OrderLineInput } from "@yozan/core/frank-portal";

/**
 * 打席QRからのビジター注文（#154）。
 * 未ログインで叩ける唯一の書き込み。守りは3つ:
 *   - 打席コードは必ずDBで実在を確認する（存在しない打席には注文を作らせない）
 *   - 商品はDBのメニューからしか選べない（価格はクライアントから受け取らない）
 *   - 決済はしない（payment_status=unpaid のまま伝票に出す）＝金銭的な悪用の余地がない
 */
export async function submitGuestOrder(formData: FormData) {
  const code = String(formData.get("bay") ?? "");
  const bay = code ? await bayByCode(code) : null;
  if (!bay) redirect("/member/login");

  const store = await resolveHimeji();
  if (!store) redirect("/member/login");

  const menu = await loadMenu(store.companyId);
  const lines: OrderLineInput[] = [];
  for (const item of menu) {
    const qty = Number(formData.get(`q_${item.id}`) ?? 0);
    if (qty > 0) lines.push({ item, qty });
  }
  if (lines.length === 0) redirect(`/bay/${encodeURIComponent(bay.code)}?err=1`);

  const result = await placeOrder({
    companyId: store.companyId,
    storeId: store.storeId,
    bayId: bay.id,
    member: null,
    checkinId: null,
    guestLabel: bay.name,
    lines,
    source: "bay",
  });
  if (!result.ok) redirect(`/bay/${encodeURIComponent(bay.code)}?err=1`);

  await logEvent(store.companyId, {
    event_type: "frank.order.placed",
    title: `打席QR注文 ${result.orderNo}: ${bay.name}（ビジター・¥${result.total.toLocaleString("ja-JP")}・未決済）`,
    source: "web", source_type: "external", severity: "info", amount: result.total,
  });

  redirect(`/bay/${encodeURIComponent(bay.code)}?ok=${encodeURIComponent(result.message)}`);
}
