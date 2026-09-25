import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { rebalanceCashLedger } from "@yozan/core/cash-ledger";
import { FRANK_STORE_ID } from "@/lib/store-scope";
import type { ManualSale } from "@yozan/core/frank-manual-sale";
import { manualSaleMemo } from "@yozan/core/frank-manual-sale";

/**
 * 現金・振込でお受けした分を売上台帳（mon_sales）に記録する（#278・2026-09-25）
 *
 * ★ 領収書は「記録された入金」からしか作れない（#222）。この決まりは変えない。
 *   変えたのは入口で、Square の Webhook しか書けなかった台帳に、
 *   **お受けしたことをスタッフが記録できる道**を1本足した。
 *
 * ★ Square の行と必ず見分けがつくようにする
 *   detail.manual = true／source='app'／entered_by に記録した人の名前。
 *   取り消せるのは manual の行だけ＝Square の入金は画面から消せない。
 *
 * ★ 現金は現金出納にも入れる（Money OS の売上入力・Square現金と同じ動き）
 *   入れないと、レジの中の現金と帳簿が合わなくなる。
 */

const SEGMENT_CODE_HIMEJI = "himeji";

type Ctx = { companyId: string; storeId: string; segmentId: string };

async function frankCtx(companyId: string): Promise<Ctx | null> {
  const admin = createAdmin();
  const { data: seg } = await admin
    .from("fin_segments")
    .select("id")
    .eq("company_id", companyId)
    .eq("code", SEGMENT_CODE_HIMEJI)
    .is("deleted_at", null)
    .maybeSingle();
  // segment_id は NOT NULL。無ければ何も書かない（黙って別の事業に混ぜない）
  if (!seg) return null;
  return { companyId, storeId: FRANK_STORE_ID, segmentId: String(seg.id) };
}

export async function recordManualSale(input: {
  companyId: string;
  memberId: string;
  memberName: string;
  memberNo: string | null;
  memberKind: string | null;
  staffName: string;
  staffId: string | null;
  sale: ManualSale;
}): Promise<{ ok: true; saleId: string } | { ok: false; message: string }> {
  const ctx = await frankCtx(input.companyId);
  if (!ctx) return { ok: false, message: "姫路の事業区分（himeji）が見つからないため記録できませんでした" };

  const admin = createAdmin();
  const { sale } = input;
  const { data, error } = await admin
    .from("mon_sales")
    .insert({
      company_id: ctx.companyId,
      store_id: ctx.storeId,
      segment_id: ctx.segmentId,
      sold_on: sale.soldOn,
      category: sale.category,
      amount: sale.amountExTax,
      tax_included: sale.amountIncTax,
      pay_method: sale.payMethod,
      memo: manualSaleMemo(sale, input.memberNo, input.staffName),
      customer_name: input.memberName,
      member_kind: input.memberKind ?? "会員",
      entered_by: input.staffName || "スタッフ",
      source: "app",
      detail: {
        frunk_member_id: input.memberId,
        manual: true,
        recorded_by: input.staffId,
        ...(sale.months ? { months: sale.months } : {}),
      },
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: `記録できませんでした（${error?.message ?? "不明"}）` };

  const saleId = String((data as { id: string }).id);

  if (sale.payMethod === "現金") {
    const { data: last } = await admin
      .from("mon_cash_ledger")
      .select("balance")
      .eq("company_id", ctx.companyId)
      .eq("store_id", ctx.storeId)
      .is("deleted_at", null)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    await admin.from("mon_cash_ledger").insert({
      company_id: ctx.companyId,
      store_id: ctx.storeId,
      segment_id: ctx.segmentId,
      entry_date: sale.soldOn,
      summary: sale.category,
      description: `${input.memberName} 様（現金）`,
      in_amount: sale.amountIncTax,
      out_amount: 0,
      balance: Number((last as { balance?: number } | null)?.balance ?? 0) + sale.amountIncTax,
      memo: "会員カードから記録",
      entered_by: input.staffName || "スタッフ",
      source: "sales",
      source_ref: saleId,
    });
    // 過去日で入れると以降の残高がずれるので積み直す
    await rebalanceCashLedger(admin, ctx.companyId, ctx.storeId);
  }

  return { ok: true, saleId };
}

/**
 * 記録を取り消す（打ち間違いの救済）。
 * ⚠ 取り消せるのは手で記録した行だけ。Square の入金は画面から消せない（台帳と実際の入金がずれるため）。
 */
export async function voidManualSale(
  companyId: string,
  saleId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const admin = createAdmin();
  const { data: row } = await admin
    .from("mon_sales")
    .select("id, store_id, pay_method, detail")
    .eq("id", saleId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return { ok: false, message: "その記録が見つかりません" };
  const detail = ((row as { detail?: Record<string, unknown> }).detail ?? {}) as Record<string, unknown>;
  if (detail.manual !== true) {
    return { ok: false, message: "カード決済の記録は取り消せません（Squareの入金と食い違うため）" };
  }

  const now = new Date().toISOString();
  await admin.from("mon_sales").update({ deleted_at: now }).eq("id", saleId).eq("company_id", companyId);
  await admin
    .from("mon_cash_ledger")
    .update({ deleted_at: now })
    .eq("company_id", companyId)
    .eq("source_ref", saleId)
    .is("deleted_at", null);
  await rebalanceCashLedger(admin, companyId, FRANK_STORE_ID);
  return { ok: true };
}
