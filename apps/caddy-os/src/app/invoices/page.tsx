import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { cardCls } from "@/components/ui";
import { createAdmin } from "@yozan/core/supabase/admin";
import { currentYm, ymRange, yen } from "@/lib/caddy";
import { buildInvoice } from "@/lib/invoice";
import { InvoiceTabs } from "./tabs";
import { IssueReceivable } from "./issue-receivable";
import { markInvoiceStatus } from "../actions";

export const dynamic = "force-dynamic";

/** 取引先ごとの請求サマリ（月次）。クリックで請求書プレビュー（印刷可能） */
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const ym = sp.ym ?? currentYm();
  const { from, to } = ymRange(ym);

  const admin = createAdmin();
  const [{ data: clients }, { data: rows }, { data: invoices }] = await Promise.all([
    admin
      .from("cad_clients")
      .select("id, code, name, closing_day, payment_day")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("code"),
    admin
      .from("cad_dispatches")
      .select("client_id, dispatch_date, sales_amount")
      .eq("company_id", actor.companyId)
      .gte("dispatch_date", from)
      .lte("dispatch_date", to)
      .is("deleted_at", null)
      .gt("sales_amount", 0),
    admin
      .from("cad_invoices")
      .select("id, client_id, status")
      .eq("company_id", actor.companyId)
      .eq("kind", "receivable")
      .eq("target_month", `${ym}-01`)
      .is("deleted_at", null),
  ]);

  const cs = (clients ?? []) as Array<{
    id: string;
    code: string | null;
    name: string;
    closing_day: string | null;
    payment_day: string | null;
  }>;
  const ds = (rows ?? []) as Array<{ client_id: string; dispatch_date: string; sales_amount: number }>;

  const invByClient = new Map<string, { id: string; status: string }>();
  for (const iv of (invoices ?? []) as Array<{ id: string; client_id: string; status: string }>) {
    invByClient.set(iv.client_id, { id: iv.id, status: iv.status });
  }
  const statusLabel: Record<string, string> = { issued: "発行済", sent: "送付済", paid: "入金済", void: "取消" };

  const summaries = cs
    .map((c) => {
      const mine = ds.filter((d) => d.client_id === c.id);
      const inv = buildInvoice(mine, ym, c.closing_day);
      return { client: c, inv, count: mine.length };
    })
    .filter((s) => s.count > 0);

  const grand = summaries.reduce((s, x) => s + x.inv.total, 0);
  const unpaid = summaries.filter((s) => {
    const iv = invByClient.get(s.client.id);
    return !iv || iv.status !== "paid";
  });

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-(--color-dim) underline">
            ← ダッシュボード
          </Link>
          <h1 className="text-2xl font-bold tracking-widest">請求（受取）</h1>
          <p className="mt-1 text-sm text-(--color-dim)">取引先への請求。派遣台帳から自動生成、締め日を反映します</p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <input
            type="month"
            name="ym"
            defaultValue={ym}
            className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm"
          />
          <button className="rounded-lg border border-(--color-line) px-3 py-1.5 text-sm">表示</button>
        </form>
      </header>

      <InvoiceTabs active="receivable" ym={ym} />

      {unpaid.length > 0 ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <b>未入金 {unpaid.length}件</b>：{unpaid.map((s) => s.client.name).join("、")}（合計{" "}
          {yen(unpaid.reduce((a, s) => a + s.inv.total, 0))}）。入金を確認したら各請求書で「入金済にする」を押してください。
        </div>
      ) : null}

      <section className={cardCls}>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">{ym} の請求（{summaries.length}件）</h2>
          <p className="text-sm">
            合計（税込） <b className="tabular-nums">{yen(grand)}</b>
          </p>
        </div>

        {summaries.length === 0 ? (
          <p className="text-sm text-(--color-dim)">この月に請求対象の派遣はありません</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-(--color-dim)">
              <tr>
                <th className="pb-2">取引先</th>
                <th className="pb-2">締切日</th>
                <th className="pb-2">振込日</th>
                <th className="pb-2 text-right">人工</th>
                <th className="pb-2 text-right">小計</th>
                <th className="pb-2 text-right">税</th>
                <th className="pb-2 text-right">合計</th>
                <th className="pb-2 text-center">状態</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => {
                const iv = invByClient.get(s.client.id);
                return (
                  <tr key={s.client.id} className="border-t border-(--color-line)">
                    <td className="py-2">{s.client.name}</td>
                    <td className="py-2 tabular-nums">{s.inv.closingDate}</td>
                    <td className="py-2">{s.client.payment_day || "—"}</td>
                    <td className="py-2 text-right tabular-nums">{s.count}</td>
                    <td className="py-2 text-right tabular-nums">{yen(s.inv.subtotal)}</td>
                    <td className="py-2 text-right tabular-nums">{yen(s.inv.tax)}</td>
                    <td className="py-2 text-right font-bold tabular-nums">{yen(s.inv.total)}</td>
                    <td className="py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {iv ? (
                          <span className={`rounded px-1.5 py-0.5 text-[11px] ${iv.status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                            {statusLabel[iv.status] ?? iv.status}
                          </span>
                        ) : (
                          <span className="text-[11px] text-(--color-dim)">未発行</span>
                        )}
                        <IssueReceivable clientId={s.client.id} ym={ym} issued={!!iv} />
                        {iv && iv.status !== "paid" ? (
                          <form action={markInvoiceStatus}>
                            <input type="hidden" name="id" value={iv.id} />
                            <input type="hidden" name="status" value="paid" />
                            <button className="rounded-lg border border-(--color-line) px-2 py-1 text-[11px]">入金済</button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2 text-right">
                      <Link
                        href={`/invoices/${s.client.id}?ym=${ym}`}
                        className="rounded-lg border border-(--color-line) px-3 py-1 text-xs"
                      >
                        請求書を開く
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <p className="mt-4 text-xs text-(--color-dim)">
        ※ 西宮高原ゴルフ倶楽部は「20日締め」のため、締切日が月末になりません（マスタの締め日を参照しています）。
      </p>
    </main>
  );
}
