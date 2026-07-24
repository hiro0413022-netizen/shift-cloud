import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@yozan/core/supabase/admin";
import { currentYm, ymRange } from "@/lib/caddy";
import { buildPayable, payableNo, jpDate, yen, type PayableSource } from "@/lib/invoice";
import { PrintButton } from "../../[clientId]/print-button";
import { markInvoiceStatus } from "../../../actions";
import { IssueBar } from "./issue-bar";

export const dynamic = "force-dynamic";

/** キャディ → YOZAN の支払請求書（印刷でPDF保存可） */
export default async function PayableDetail({
  params,
  searchParams,
}: {
  params: Promise<{ partnerId: string }>;
  searchParams: Promise<{ ym?: string }>;
}) {
  const actor = await requireActor();
  const { partnerId } = await params;
  const sp = await searchParams;
  const ym = sp.ym ?? currentYm();
  const { from, to } = ymRange(ym);

  const admin = createAdmin();
  const [{ data: partner }, { data: rows }, { data: company }, { data: existing }] = await Promise.all([
    admin
      .from("cad_partners")
      .select("id, code, name")
      .eq("id", partnerId)
      .eq("company_id", actor.companyId)
      .single(),
    admin
      .from("cad_dispatches")
      .select("dispatch_date, kind, fee_amount, transport_amount, special_amount, work_hours, cad_clients(name)")
      .eq("company_id", actor.companyId)
      .eq("partner_id", partnerId)
      .gte("dispatch_date", from)
      .lte("dispatch_date", to)
      .is("deleted_at", null)
      .order("dispatch_date"),
    admin.from("companies").select("settings").eq("id", actor.companyId).single(),
    admin
      .from("cad_invoices")
      .select("id, status, paid_at")
      .eq("company_id", actor.companyId)
      .eq("kind", "payable")
      .eq("partner_id", partnerId)
      .eq("target_month", `${ym}-01`)
      .is("deleted_at", null)
      .maybeSingle(),
  ]);

  if (!partner) notFound();

  const settings = ((company?.settings ?? {}) as { invoice?: { company_name?: string; address?: string; postal_code?: string } }).invoice ?? {};
  const payee = settings.company_name ?? "株式会社YOZAN";

  const src: PayableSource[] = ((rows ?? []) as unknown as Array<{
    dispatch_date: string;
    kind: string;
    fee_amount: number;
    transport_amount: number;
    special_amount: number;
    work_hours: number | null;
    cad_clients: { name: string } | null;
  }>).map((r) => ({
    dispatch_date: r.dispatch_date,
    kind: r.kind,
    client_name: r.cad_clients?.name ?? null,
    fee_amount: r.fee_amount,
    transport_amount: r.transport_amount,
    special_amount: r.special_amount,
    work_hours: r.work_hours,
  }));
  const pay = buildPayable(src);
  const no = payableNo(ym, partner.code, partner.name);
  const inv = existing as { id: string; status: string; paid_at: string | null } | null;
  const statusLabel: Record<string, string> = { issued: "発行済", sent: "送付済", paid: "支払済", void: "取消" };

  return (
    <>
      <div className="mx-auto max-w-3xl p-4 print:hidden">
        <div className="flex items-center justify-between">
          <Link href={`/invoices/payable?ym=${ym}`} className="text-xs text-(--color-dim) underline">
            ← 支払一覧
          </Link>
          <div className="flex items-center gap-2">
            <IssueBar partnerId={partnerId} ym={ym} issued={!!inv} />
            <PrintButton />
          </div>
        </div>
        {inv ? (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className={`rounded px-1.5 py-0.5 ${inv.status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
              {statusLabel[inv.status] ?? inv.status}
              {inv.paid_at ? `（${inv.paid_at}）` : ""}
            </span>
            {inv.status !== "paid" ? (
              <form action={markInvoiceStatus}>
                <input type="hidden" name="id" value={inv.id} />
                <input type="hidden" name="status" value="paid" />
                <button className="rounded-lg border border-(--color-line) px-2 py-0.5">支払済にする</button>
              </form>
            ) : (
              <form action={markInvoiceStatus}>
                <input type="hidden" name="id" value={inv.id} />
                <input type="hidden" name="status" value="issued" />
                <button className="rounded-lg border border-(--color-line) px-2 py-0.5">未払に戻す</button>
              </form>
            )}
          </div>
        ) : (
          <p className="mt-3 text-xs text-(--color-dim)">
            この請求書はまだ記録されていません。「発行して記録」を押すと状態管理（支払済/未払）ができます。
          </p>
        )}
      </div>

      {/* 請求書本体（A4想定・印刷時はこの部分だけ） */}
      <div className="invoice mx-auto max-w-3xl bg-white p-10 text-[13px] leading-relaxed text-black">
        <h1 className="mb-8 text-center text-2xl font-bold tracking-[0.5em]">請求書</h1>

        <div className="flex justify-between">
          <div className="w-1/2">
            <p className="border-b border-black pb-1 text-lg font-bold">{payee} 御中</p>
            <p className="mt-3 text-xs">{settings.postal_code ?? ""}</p>
            <p className="text-xs">{settings.address ?? ""}</p>
          </div>
          <div className="w-[45%] text-xs">
            <p className="text-right">
              {ym.replace("-", "年 ")}月分
            </p>
            <p className="mt-3 font-bold">{partner.name}</p>
            <p className="mt-1 text-slate-500">（委託先コード {partner.code ?? "—"}）</p>
            <div className="mt-3 border border-black p-2 text-[11px] text-slate-500">
              <p>振込先は別途ご連絡ください</p>
              <p>（口座情報は本システムに保持していません）</p>
            </div>
          </div>
        </div>

        <p className="mt-8">下記の通りご請求申し上げます。</p>

        <table className="mt-3 w-full border-collapse text-xs">
          <thead>
            <tr className="border-y border-black">
              <th className="py-2 text-left">日付</th>
              <th className="py-2 text-left">内容</th>
              <th className="w-24 py-2 text-right">委託料</th>
              <th className="w-20 py-2 text-right">交通費</th>
              <th className="w-20 py-2 text-right">手当</th>
              <th className="w-24 py-2 text-right">金額</th>
            </tr>
          </thead>
          <tbody>
            {pay.lines.map((l, i) => (
              <tr key={`${l.date}-${i}`} className="border-b border-slate-300">
                <td className="py-1.5 whitespace-nowrap">{jpDate(l.date)}</td>
                <td className="py-1.5">{l.label}</td>
                <td className="py-1.5 text-right tabular-nums">{l.fee ? yen(l.fee) : "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{l.transport ? yen(l.transport) : "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{l.special ? yen(l.special) : "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{yen(l.amount)}</td>
              </tr>
            ))}
            {pay.lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-center text-slate-400">
                  この月の対象がありません
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="mt-4 flex justify-between">
          <p className="text-xs text-slate-500">
            委託料 {yen(pay.fee)} ／ 交通費 {yen(pay.transport)} ／ 手当 {yen(pay.special)}
          </p>
          <table className="w-64 text-xs">
            <tbody>
              <tr>
                <td className="py-1">小計</td>
                <td className="py-1 text-right tabular-nums">{yen(pay.total)}</td>
              </tr>
              <tr>
                <td className="py-1 text-slate-500">消費税</td>
                <td className="py-1 text-right text-slate-500">免税</td>
              </tr>
              <tr className="border-t-2 border-black">
                <td className="py-2 font-bold">ご請求金額</td>
                <td className="py-2 text-right text-lg font-bold tabular-nums">¥ {yen(pay.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-right text-[10px] text-slate-400">請求番号: {no}</p>
      </div>

      <div className="mx-auto max-w-3xl p-4 text-xs text-(--color-dim) print:hidden">
        派遣台帳から自動生成しています（{pay.lines.length}明細）。免税事業者のため消費税は加算していません。
        ゴルフウィング勤務分も含みます。金額が合わない場合は台帳を修正してください。
      </div>
    </>
  );
}
