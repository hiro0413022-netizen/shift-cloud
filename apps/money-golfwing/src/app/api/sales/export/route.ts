import { NextResponse, type NextRequest } from "next/server";
import { getMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore, monthRange } from "@/lib/money";
import { buildSalesWorkbook, fiscalTerm, type SalesExportRow } from "@/lib/sales-excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SaleRow = {
  sold_on: string; category: string; customer_name: string | null; member_kind: string | null;
  amount: number | string; pay_method: string | null; memo: string | null; entered_by: string | null;
  detail: Record<string, unknown> | null;
};

type LedgerRow = {
  sold_on: string; customer_name: string | null; member_kind: string | null;
  item_category: string | null; item_type: string | null; maker: string | null; product_name: string | null;
  list_price: number | string | null; discount: number | string | null; sale_price: number | string | null;
  qty: number | string | null; pay_method: string | null; pro: string | null; memo: string | null;
};

type InvItem = { maker: string; category: string; list_price: number | null; cost_price: number | null };

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** JSTの今月（サーバーのUTCで前月に落ちないように。#73） */
function currentMonth(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
}

/**
 * 売上一覧のExcel出力（表示中の月／店舗）。
 *
 * 中身は2系統をまとめて1シートにする:
 *  - mon_sales の source='app'  … アプリで入力した売上
 *  - mon_sales_lines            … 売上台帳Excelから取り込んだ明細
 * メーカー名・定価・仕入れ値は在庫リスト(inv_items)から自動で補完する。
 *
 * source が ledger / migration / slack_import の行は「月末日付・お客様名なしの月次まるめ」で、
 * 中身は mon_sales_lines と同じものを合計したもの。入れると明細が二重に載るので必ず除外する。
 */
export async function GET(request: NextRequest) {
  const actor = await getMoneyActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const store = await getCurrentStore(actor);
  if (!store) return NextResponse.json({ error: "店舗が選択されていません" }, { status: 400 });

  const q = request.nextUrl.searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(q) ? q : currentMonth();
  const { from, to } = monthRange(month);

  const admin = createAdmin();

  const [{ data: sales }, { data: lines }] = await Promise.all([
    admin.from("mon_sales")
      .select("sold_on, category, customer_name, member_kind, amount, pay_method, memo, entered_by, detail")
      .eq("company_id", actor.companyId).eq("store_id", store.id)
      .gte("sold_on", from).lt("sold_on", to)
      .eq("source", "app")
      .is("deleted_at", null)
      .order("sold_on", { ascending: true }).order("created_at", { ascending: true }),
    admin.from("mon_sales_lines")
      .select("sold_on, customer_name, member_kind, item_category, item_type, maker, product_name, list_price, discount, sale_price, qty, pay_method, pro, memo")
      .eq("company_id", actor.companyId).eq("store_id", store.id)
      .gte("sold_on", from).lt("sold_on", to)
      .is("deleted_at", null)
      .order("sold_on", { ascending: true }),
  ]);

  const saleRows = (sales ?? []) as SaleRow[];
  const ledgerRows = (lines ?? []) as LedgerRow[];

  // 在庫リンクのある行だけ在庫マスタを引く（メーカー名/種類/定価/仕入れ値の自動補完）
  const invIds = [...new Set(
    saleRows.map((r) => String(r.detail?.inv_item_id ?? "")).filter(Boolean),
  )];
  const invMap = new Map<string, InvItem>();
  if (invIds.length > 0) {
    const { data: items } = await admin.from("inv_items")
      .select("id, maker, category, list_price, cost_price")
      .eq("company_id", actor.companyId).in("id", invIds);
    for (const it of items ?? []) {
      invMap.set(String(it.id), {
        maker: String(it.maker ?? ""),
        category: String(it.category ?? ""),
        list_price: it.list_price == null ? null : Number(it.list_price),
        cost_price: it.cost_price == null ? null : Number(it.cost_price),
      });
    }
  }

  const fromApp: SalesExportRow[] = saleRows.map((r) => {
    const detail = r.detail ?? {};
    const qty = Math.max(1, num(detail.qty) || 1);
    const amount = num(r.amount);
    const unit = Math.round(amount / qty); // 売価（税抜・1個あたり）
    const inv = invMap.get(String(detail.inv_item_id ?? "")) ?? null;
    // 定価は「入力値 → 在庫マスタ → 売価」の順で採用。
    // 割引額は保存値をそのまま使わず、必ず「売価 − 定価」で出し直す。
    // こうしておけば金額を手で上書きした明細でも Excel の 定価+割引額=売価・売価×個数=金額 が崩れない。
    const entered = detail.list_price != null ? Math.round(num(detail.list_price)) : null;
    const fromInv = inv?.list_price != null && inv.list_price > 0 ? Math.round(inv.list_price) : null;
    const listPrice = entered ?? fromInv ?? unit;
    const discount = listPrice !== unit ? unit - listPrice : null;
    return {
      soldOn: String(r.sold_on),
      customerName: r.customer_name ?? "",
      memberKind: r.member_kind ?? "",
      itemCategory: r.category ?? "",
      // 種類・メーカーは入力値を優先、無ければ在庫マスタから補完
      itemType: String(detail.item_type ?? "") || (inv?.category ?? ""),
      maker: String(detail.maker ?? "") || (inv?.maker ?? ""),
      productName: String(detail.product_name ?? ""),
      listPrice,
      discount,
      qty,
      payMethod: r.pay_method ?? "",
      memo: r.memo ?? "",
      pro: String(detail.pro ?? ""),
      seller: String(detail.seller ?? ""),
      enteredBy: r.entered_by ?? "",
      costPrice: inv?.cost_price != null && inv.cost_price > 0 ? Math.round(inv.cost_price) : null,
    };
  });

  const fromLedger: SalesExportRow[] = ledgerRows.map((r) => {
    const salePrice = num(r.sale_price);
    const listPrice = r.list_price == null ? salePrice : Math.round(num(r.list_price));
    return {
      soldOn: String(r.sold_on),
      customerName: r.customer_name ?? "",
      memberKind: r.member_kind ?? "",
      itemCategory: r.item_category ?? "",
      itemType: r.item_type ?? "",
      maker: r.maker ?? "",
      productName: r.product_name ?? "",
      listPrice,
      discount: r.discount == null ? null : Math.round(num(r.discount)),
      qty: Math.max(1, num(r.qty) || 1),
      payMethod: r.pay_method ?? "",
      memo: r.memo ?? "",
      pro: r.pro ?? "",
      seller: "",
      enteredBy: "",
      costPrice: null,
    };
  });

  const rows = [...fromLedger, ...fromApp].sort((a, b) => a.soldOn.localeCompare(b.soldOn));

  const term = fiscalTerm(`${month}-01`);
  const wb = buildSalesWorkbook(rows, `${term}期売上一覧`);
  const buffer = await wb.xlsx.writeBuffer();

  const filename = `売上データ_${store.name}_${month}.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
