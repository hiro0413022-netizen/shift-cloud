import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import type { SaleRow } from "@/lib/frank-receipt-pure";

export { saleLabel, receiptNo, type SaleRow } from "@/lib/frank-receipt-pure";

/**
 * 領収書の材料（#222・2026-09-05 ユーザー依頼「月会費の領収書を出したい」）
 *
 * ★ 金額は入力させない。**実際に入金として記録された行（mon_sales）だけ**を選んでもらう。
 *   受け取っていない金額の領収書を作れないようにするため。
 * ★ Square の入金Webhook（#129/#131）が「月会費」「入会金」の行を書いている。
 *   前受け（2ヶ月分など）は1行にまとまっていて、tax_included が税込金額。
 */

const PAY_LABEL: Record<string, string> = { カード: "クレジットカード" };

export async function loadMemberSales(memberId: string, companyId: string): Promise<SaleRow[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("mon_sales")
    .select("id, sold_on, category, amount, tax_included, pay_method, detail")
    .eq("company_id", companyId)
    .eq("detail->>frunk_member_id", memberId)
    .is("deleted_at", null)
    .order("sold_on", { ascending: false })
    .limit(60);

  type Row = {
    id: string;
    sold_on: string;
    category: string;
    amount: number | null;
    tax_included: number | null;
    pay_method: string | null;
    detail: Record<string, unknown> | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    sold_on: String(r.sold_on),
    category: String(r.category ?? ""),
    // tax_included が入っていない古い行は、税抜×1.1 で補う（表示は必ず税込に揃える）
    amount_inc_tax: Number(r.tax_included ?? 0) || Math.round(Number(r.amount ?? 0) * 1.1),
    pay_method: r.pay_method ? (PAY_LABEL[r.pay_method] ?? r.pay_method) : null,
    months: Number((r.detail as { months?: number } | null)?.months ?? 0) || null,
  }));
}

