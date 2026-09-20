import "server-only";
import { createAdmin } from "@yozan/core/supabase/admin";
import type { Actor } from "@/lib/auth";
import { getQuote, listPurchaseDrafts } from "@/lib/craft";
import { ensureWorkOrder } from "@/lib/work-order";
import { todayJst, workStatusOf } from "@/lib/work-status";

export type PlaceOrderResult = {
  ok: boolean;
  message?: string;
  /** 発注管理にできた発注（プール）。これを開く */
  orders: { id: number; orderNo: string; supplier: string | null }[];
  /** 発注に載せられなかった明細（手入力行・仕入先未設定）。発注管理で人が入れる */
  skipped: { product_name: string; manufacturer: string | null; reason: string }[];
  /** すでに発注済みだった（二重に作らなかった） */
  already: boolean;
};

/**
 * 【発注する】
 *   1. 注文書が無ければ作る
 *   2. この伝票の発注がまだ無ければ、発注管理（golfwing.purchase_orders）の「発注プール」に仕入先ごとに作る
 *      ＝ gw_create_purchase_drafts。すでにあれば作らない（押し直しても二重発注にならない）
 *   3. 注文書の「発注」日に今日を入れ、伝票を「発注済み」にする
 * 実際に仕入先へ送る（メール・Web EDI）のは、今まで通り発注管理の画面から。
 */
export async function placeOrder(actor: Actor, quoteId: number): Promise<PlaceOrderResult> {
  const admin = createAdmin();
  const full = await getQuote(actor, quoteId);
  if (!full) return { ok: false, message: "伝票が見つかりません", orders: [], skipped: [], already: false };
  // 手入力の行（free）も取り寄せる商品。2026-09-20 まで対象外にしていて、発注から黙って抜けていた（migration 0196）
  const orderable = full.items.filter((it) => ["product", "grip", "sleeve", "coating", "free"].includes(it.line_kind ?? ""));
  if (orderable.length === 0) {
    return { ok: false, message: "取り寄せる商品の明細がありません（工賃だけの伝票です）", orders: [], skipped: [], already: false };
  }

  const workId = await ensureWorkOrder(actor, full);
  const existing = await listPurchaseDrafts(actor, workId);

  // 何度押しても「まだ発注に載っていない明細」だけを足す（載せ済みの明細は二重に入れない）。
  // 以前は1度でも発注があると何もしなかったので、あとから足した明細や手入力の行が抜けたままになった。
  const { data, error } = await admin.rpc("gw_create_purchase_drafts", {
    p_company: actor.companyId,
    p_quote_id: quoteId,
    p_ordered_by: actor.name,
  });
  if (error) return { ok: false, message: error.message, orders: [], skipped: [], already: false };
  const r = (data ?? {}) as { error?: string; skipped?: PlaceOrderResult["skipped"]; orders?: { added?: number }[] };
  if (r.error) return { ok: false, message: r.error, orders: [], skipped: [], already: false };
  const skipped: PlaceOrderResult["skipped"] = r.skipped ?? [];
  const added = (r.orders ?? []).reduce((n, o) => n + (o.added ?? 0), 0);
  const already = existing.length > 0 && added === 0;

  const pos = await listPurchaseDrafts(actor, workId);

  // 注文書の「発注」日。すでに入っていれば触らない
  const { data: w } = await admin
    .from("gw_work_orders")
    .select("ordered_on, arrived_on, assembled_on, delivered_on, paid_on")
    .eq("id", workId)
    .maybeSingle();
  if (w && pos.length > 0 && !w.ordered_on) {
    const next = { ...w, ordered_on: todayJst() };
    await admin
      .from("gw_work_orders")
      .update({ ordered_on: next.ordered_on, status: workStatusOf(next), updated_at: new Date().toISOString() })
      .eq("id", workId)
      .eq("company_id", actor.companyId);
  }
  if (pos.length > 0) {
    await admin.from("gw_quotes").update({ status: "ordered" }).eq("id", quoteId).eq("company_id", actor.companyId);
  }

  return {
    ok: pos.length > 0,
    message:
      pos.length > 0
        ? undefined
        : "発注管理に載せられる商品がありませんでした（商品マスタに仕入先が入っていない／手入力の行です）",
    orders: pos.map((p) => ({ id: p.purchase_order_id, orderNo: p.order_no, supplier: p.supplier })),
    skipped,
    already,
  };
}
