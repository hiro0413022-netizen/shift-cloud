import "server-only";
import { createAdmin } from "@yozan/core/supabase/admin";
import type { Actor } from "@/lib/auth";
import { getQuote } from "@/lib/craft";

/**
 * 伝票の明細を Money OS（mon_sales_lines）へ計上する。
 *
 * ★ 金額はここで計算して渡す。
 *   gw_quote_items の amount 列は誰も書いていない（ずっと0）。金額の正典は
 *   @yozan/core/fitting-quote であって、画面も帳票もその都度計算している。
 *   DBの列を読んで計上すると 0円 で入る（2026-09-13 に気づいて直した）。
 *   かといってSQL側に割引の式を書き写すと正典が2つになるので、それもしない。
 * ★ 二重計上よけ（gw_sales_postings）と返金のマイナス行はDB関数側にある。
 */
export async function postSales(actor: Actor, quoteId: number): Promise<{ posted: number; amount: number }> {
  const full = await getQuote(actor, quoteId);
  if (!full) throw new Error("伝票が見つかりません");

  const lines = full.items.map((it, i) => {
    const p = full.priced.items[i];
    const qty = Math.max(1, Number(it.quantity ?? 1));
    const amount = Number(p?.amount ?? 0);
    return {
      quote_item_id: it.id,
      item_category: it.item_category ?? "その他",
      line_kind: it.line_kind ?? "product",
      maker: it.manufacturer,
      product_name: it.product_name,
      list_price: Number(it.list_price ?? 0),
      discount: Number(p?.discountAmount ?? 0),
      sale_price: Math.floor(amount / qty),
      qty,
      amount,
    };
  });

  const { data, error } = await createAdmin().rpc("gw_post_sales", {
    p_company: actor.companyId,
    p_quote_id: quoteId,
    p_staff: actor.staffId,
    p_lines: lines,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { posted?: number; amount?: number };
  return { posted: Number(r.posted ?? 0), amount: Number(r.amount ?? 0) };
}
