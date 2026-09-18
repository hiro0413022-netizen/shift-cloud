import "server-only";
import { createAdmin } from "@yozan/core/supabase/admin";
import type { Actor } from "@/lib/auth";
import type { FullQuote } from "@/lib/craft";

/**
 * 注文書をつくる（すでにあれば何もしない）。見積のシャフト行1本につき、組立指示書の行を1つ用意する。
 * （紙では毎回いちから書いていた欄を、最初から埋まった状態で出す）
 *
 * 呼ぶ場所: 注文書タブの【注文書をつくる】／伝票上部の【ご注文いただいた】／【発注する】（注文書が無ければ先に作る）
 */
export async function ensureWorkOrder(actor: Actor, full: FullQuote): Promise<number> {
  if (full.work) return full.work.id;
  const admin = createAdmin();
  const id = full.quote.id;

  const { data: seq } = await admin.rpc("gw_next_work_order_seq", { p_company: actor.companyId });
  const n = Number(seq ?? 1);

  const { data, error } = await admin
    .from("gw_work_orders")
    .insert({
      company_id: actor.companyId,
      store_id: full.quote.store_id,
      quote_id: id,
      order_seq: n,
      order_no: `W-${String(n).padStart(4, "0")}`,
      created_by: actor.staffId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "注文書を作成できませんでした");

  const shafts = full.items.filter((it) => it.line_kind === "product" && it.item_category === "シャフト");
  if (shafts.length > 0) {
    await admin.from("gw_work_order_specs").insert(
      shafts.map((it, i) => ({
        company_id: actor.companyId,
        work_order_id: data.id,
        line_no: i + 1,
        priority: i + 1,
        quote_item_id: it.id,
        length_min: it.finish_length_inch,
        length_max: it.finish_length_inch,
      }))
    );
  }

  // 発注済みより先に戻さない
  if (full.quote.status !== "ordered") {
    await admin.from("gw_quotes").update({ status: "accepted" }).eq("id", id).eq("company_id", actor.companyId);
  }
  return data.id as number;
}
