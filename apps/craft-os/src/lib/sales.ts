import "server-only";
import { createAdmin } from "@yozan/core/supabase/admin";
import type { Actor } from "@/lib/auth";

/**
 * 伝票の明細を Money OS（mon_sales_lines）へ計上する。
 *
 * ★ 計上そのものは DB 関数 gw_post_sales 1か所に置いてある。
 *   二重計上よけ（gw_sales_postings）と返金のマイナス行を、呼ぶ側に持たせないため。
 * ★ お渡し日が入った時点で自動的に呼ばれる。工房を通さない伝票（グリップだけ等）は
 *   明細画面のボタンから手で計上する。
 */
export async function postSales(actor: Actor, quoteId: number): Promise<{ posted: number; amount: number }> {
  const { data, error } = await createAdmin().rpc("gw_post_sales", {
    p_company: actor.companyId,
    p_quote_id: quoteId,
    p_staff: actor.staffId,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { posted?: number; amount?: number };
  return { posted: Number(r.posted ?? 0), amount: Number(r.amount ?? 0) };
}
