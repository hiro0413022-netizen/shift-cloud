import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@yozan/core/supabase/admin";
import { currentYm, ymRange } from "@/lib/caddy";
import { buildInvoice, invoiceNo, yen } from "@/lib/invoice";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

type InvoiceSettings = {
  company_name?: string;
  representative?: string;
  postal_code?: string;
  address?: string;
  bank_name?: string;
  bank_account?: string;
  bank_holder?: string;
  tax_rate?: number;
  item_label?: string;
};

/** 請求書（実物レイアウトを再現。ブラウザの印刷でPDF保存できる） */
export default async function InvoiceDetail({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ ym?: string }>;
}) {
  const actor = await requireActor();
  const { clientId } = await params;
  const sp = await searchParams;
  const ym = sp.ym ?? currentYm();
  const { from, to } = ymRange(ym);

  const admin = createAdmin();
  const [{ data: client }, { data: rows }, { data: company }] = await Promise.all([
    admin
      .from("cad_clients")
      .select("id, code, name, postal_code, address, closing_day, payment_day")
      .eq("id", clientId)
      .eq("company_id", actor.companyId)
      .single(),
    admin
      .from("cad_dispatches")
      .select("dispatch_date, sales_amount")
      .eq("company_id", actor.companyId)
      .eq("client_id", clientId)
      .gte("dispatch_date", from)
      .lte("dispatch_date", to)
      .is("deleted_at", null)
      .gt("sales_amount", 0)
      .order("dispatch_date"),
    admin.from("companies").select("settings").eq("id", actor.companyId).single(),
  ]);

  if (!client) notFound();

  const settings = ((company?.settings ?? {}) as { invoice?: InvoiceSettings }).invoice ?? {};
  const taxRate = settings.tax_rate ?? 0.1;
  const inv = buildInvoice(
    (rows ?? []) as Array<{ dispatch_date: string; sales_amount: number }>,
    ym,
    client.closing_day,
    taxRate,
    settings.item_label ?? "キャディ業務料"
  );
  const no = invoiceNo(ym, client.code, client.name);
  const [cy, cm, cd] = inv.closingDate.split("-").map(Number);

  return (
    <>
      <div className="mx-auto max-w-3xl p-4 print:hidden">
        <div className="flex items-center justify-between">
          <Link href={`/invoices?ym=${ym}`} className="text-xs text-[--color-dim] underline">
            ← 請求一覧
          </Link>
          <PrintButton />
        </div>
      </div>

      {/* 請求書本体（A4想定。印刷時はこの部分だけが出る） */}
      <div className="invoice mx-auto max-w-3xl bg-white p-10 text-[13px] leading-relaxed text-black">
        <h1 className="mb-8 text-center text-2xl font-bold tracking-[0.5em]">請求書</h1>

        <div className="flex justify-between">
          {/* 宛先 */}
          <div className="w-1/2">
            <p className="border-b border-black pb-1 text-lg font-bold">{client.name} 御中</p>
            <p className="mt-3 text-xs">〒{client.postal_code ?? ""}</p>
            <p className="text-xs">{client.address ?? ""}</p>
          </div>

          {/* 日付・差出人・振込先 */}
          <div className="w-[45%] text-xs">
            <p className="text-right">
              日付{" "}
              <b>
                {cy}年{cm}月{cd}日 締切分
              </b>
            </p>
            <p className="mt-3 font-bold">{settings.company_name ?? "株式会社YOZAN"}</p>
            <p>{settings.representative ?? ""}</p>
            <p className="mt-1">{settings.postal_code ?? ""}</p>
            <p>{settings.address ?? ""}</p>

            <div className="mt-3 border border-black p-2">
              <p className="font-bold">振込先銀行</p>
              <p>{settings.bank_name ?? ""}</p>
              <p>{settings.bank_account ?? ""}</p>
              <p>口座名義 {settings.bank_holder ?? ""}</p>
            </div>
          </div>
        </div>

        <p className="mt-8">下記の通りご請求申し上げます。</p>

        <table className="mt-3 w-full border-collapse text-xs">
          <thead>
            <tr className="border-y border-black">
              <th className="py-2 text-left">説明</th>
              <th className="w-16 py-2 text-right">数量</th>
              <th className="w-24 py-2 text-right">単価</th>
              <th className="w-28 py-2 text-right">金額</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => (
              <tr key={`${l.date}-${l.unit_price}`} className="border-b border-slate-300">
                <td className="py-1.5">{l.label}</td>
                <td className="py-1.5 text-right tabular-nums">{l.qty}</td>
                <td className="py-1.5 text-right tabular-nums">{yen(l.unit_price)}</td>
                <td className="py-1.5 text-right tabular-nums">{yen(l.amount)}</td>
              </tr>
            ))}
            {/* 実物と同じく余白行を出す（印刷時の見た目） */}
            {Array.from({ length: Math.max(0, 12 - inv.lines.length) }).map((_, i) => (
              <tr key={`blank-${i}`} className="border-b border-slate-200">
                <td className="py-1.5">&nbsp;</td>
                <td />
                <td />
                <td className="py-1.5 text-right text-slate-400">-</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-between">
          <p className="text-xs">ご利用ありがとうございます。</p>
          <table className="w-64 text-xs">
            <tbody>
              <tr>
                <td className="py-1">小計</td>
                <td className="py-1 text-right tabular-nums">{yen(inv.subtotal)}</td>
              </tr>
              <tr>
                <td className="py-1">税率</td>
                <td className="py-1 text-right tabular-nums">{Math.round(inv.taxRate * 100)}%</td>
              </tr>
              <tr>
                <td className="py-1">税金</td>
                <td className="py-1 text-right tabular-nums">{yen(inv.tax)}</td>
              </tr>
              <tr className="border-t-2 border-black">
                <td className="py-2 font-bold">集計</td>
                <td className="py-2 text-right text-lg font-bold tabular-nums">¥ {yen(inv.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-right text-[10px] text-slate-400">請求番号: {no}</p>
      </div>

      <div className="mx-auto max-w-3xl p-4 text-xs text-[--color-dim] print:hidden">
        派遣台帳から自動生成しています（{inv.lines.length}明細 / {inv.lines.reduce((s, l) => s + l.qty, 0)}人工）。
        金額が合わない場合は台帳を修正してください。
      </div>
    </>
  );
}
