import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/kernel";
import { FRANK_STORE_ID } from "@yozan/core/frank-booking";
import { mapSquarePayment, mapSquareRefund, verifySquareSignature, type SquarePayment, type SquareRefund } from "@/lib/frank-pos-pure";

export { verifySquareSignature };

/**
 * FRANK GOLF 店頭POS（Square）連携 #118 / 実行計画§3-7
 *
 * Square で店頭会計（物販・ビジター・レッスン単発・体験料。現金もレジ打ちすれば同経路）
 * → Webhook → mon_sales（Money OS）へ自動記録 → refresh_money_to_finance で
 * fin_entries／KPI／日次レポートへ既存パイプのまま流れる。
 *
 * 役割分担: 月会費= Stripe（frank-billing.ts）／店頭都度払い= Square（ここ）。
 * 純粋なマッピング・署名検証は frank-pos-pure.ts（tests/frank-pos.test.ts で固定）。
 *
 * 必要な環境変数（Vercel: yozan-genesis）:
 *   SQUARE_WEBHOOK_SIGNATURE_KEY … Square Developer > Webhooks の署名キー
 *   SQUARE_WEBHOOK_URL           … Webhookに登録したURL（署名の計算に必要）
 *                                  省略時: https://yozan-genesis.vercel.app/api/public/frank/pos/webhook
 * 未設定の間は 503 を返すだけでエラーにはしない（Stripeと同じ方針）。
 *
 * 設定手順の正典: docs/genesis/OPERATIONS.md §Square
 */

const SEGMENT_CODE_HIMEJI = "himeji"; // fin_segments.code（姫路インドアゴルフ）
export const DEFAULT_WEBHOOK_URL = "https://yozan-genesis.vercel.app/api/public/frank/pos/webhook";

type Admin = ReturnType<typeof createAdmin>;

async function frankStore(admin: Admin) {
  const { data: store } = await admin
    .from("stores")
    .select("id, company_id")
    .eq("id", FRANK_STORE_ID)
    .maybeSingle();
  if (!store) return null;
  const { data: seg } = await admin
    .from("fin_segments")
    .select("id")
    .eq("company_id", store.company_id)
    .eq("code", SEGMENT_CODE_HIMEJI)
    .is("deleted_at", null)
    .maybeSingle();
  return { storeId: String(store.id), companyId: String(store.company_id), segmentId: seg ? String(seg.id) : null };
}

/** 同じ支払い/返金を二重記録しない（Webhookは同一イベントが複数回届く） */
async function alreadyRecorded(admin: Admin, key: "square_payment_id" | "square_refund_id", id: string): Promise<boolean> {
  const { data } = await admin.from("mon_sales").select("id").eq(`detail->>${key}`, id).limit(1);
  return (data ?? []).length > 0;
}

async function insertSale(
  admin: Admin,
  ctx: { storeId: string; companyId: string; segmentId: string | null },
  row: {
    sold_on: string;
    category: string;
    amount: number;
    tax_included: number;
    pay_method?: string;
    memo: string | null;
    detail: Record<string, unknown>;
  },
): Promise<void> {
  const { data: sale, error } = await admin
    .from("mon_sales")
    .insert({
      company_id: ctx.companyId,
      store_id: ctx.storeId,
      segment_id: ctx.segmentId,
      sold_on: row.sold_on,
      category: row.category,
      amount: row.amount,
      tax_included: row.tax_included,
      pay_method: row.pay_method ?? "Square",
      memo: row.memo,
      detail: row.detail,
      entered_by: "Square(自動)",
      source: "square",
    })
    .select("id")
    .single();
  if (error) throw new Error(`mon_sales insert failed: ${error.message}`);

  // 現金はFRANK店舗の現金出納にも自動反映（Money OSの売上入力と同じ動き）
  if (row.pay_method === "現金" && row.amount > 0) {
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
    const prev = Number(last?.balance ?? 0);
    await admin.from("mon_cash_ledger").insert({
      company_id: ctx.companyId,
      store_id: ctx.storeId,
      segment_id: ctx.segmentId,
      entry_date: row.sold_on,
      summary: row.category,
      description: row.memo ?? "Square現金売上",
      in_amount: row.tax_included,
      out_amount: 0,
      balance: prev + row.tax_included,
      memo: "Square Webhookから自動連携",
      entered_by: "Square(自動)",
      source: "sales",
      source_ref: sale?.id ?? null,
    });
  }
}

/** Webhook本体。ルートは署名検証済みの payload(JSON文字列) を渡す */
export async function handleSquareEvent(payload: string): Promise<void> {
  const event = JSON.parse(payload) as {
    type?: string;
    data?: { object?: Record<string, unknown> };
  };
  const type = event.type ?? "";
  if (type !== "payment.updated" && type !== "payment.created" && type !== "refund.updated" && type !== "refund.created") return;

  const admin = createAdmin();
  const ctx = await frankStore(admin);
  if (!ctx) return;

  const obj = event.data?.object ?? {};

  if (type.startsWith("payment.")) {
    const mapped = mapSquarePayment((obj.payment ?? obj) as SquarePayment);
    if (!mapped) return;
    if (await alreadyRecorded(admin, "square_payment_id", mapped.square_payment_id)) return;
    await insertSale(admin, ctx, {
      ...mapped,
      detail: { square_payment_id: mapped.square_payment_id },
    });
  } else {
    const mapped = mapSquareRefund((obj.refund ?? obj) as SquareRefund);
    if (!mapped) return;
    if (await alreadyRecorded(admin, "square_refund_id", mapped.square_refund_id)) return;
    await insertSale(admin, ctx, {
      ...mapped,
      pay_method: "Square",
      detail: { square_refund_id: mapped.square_refund_id },
    });
    await logEvent(ctx.companyId, {
      event_type: "pos.refund",
      title: `FRANK 店頭返金: ${Math.abs(mapped.tax_included).toLocaleString()}円（Square）`.slice(0, 120),
      source: "frank_pos",
      source_type: "system",
      severity: "notice",
    });
  }

  await admin.rpc("refresh_money_to_finance", { p_company_id: ctx.companyId });
}
