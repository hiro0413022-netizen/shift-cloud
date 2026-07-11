import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { cardCls } from "@/components/ui";
import { createAdmin } from "@yozan/core/supabase/admin";
import { currentYm, ymRange, yen } from "@/lib/caddy";
import { buildInvoice } from "@/lib/invoice";

export const dynamic = "force-dynamic";

/** 取引先ごとの請求サマリ（月次）。クリックで請求書プレビュー（印刷可能） */
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const ym = sp.ym ?? currentYm();
  const { from, to } = ymRange(ym);

  const admin = createAdmin();
  const [{ data: clients }, { data: rows }] = await Promise.all([
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
  ]);

  const cs = (clients ?? []) as Array<{
    id: string;
    code: string | null;
    name: string;
    closing_day: string | null;
    payment_day: string | null;
  }>;
  const ds = (rows ?? []) as Array<{ client_id: string; dispatch_date: string; sales_amount: number }>;

  const summaries = cs
    .map((c) => {
      const mine = ds.filter((d) => d.client_id === c.id);
      const inv = buildInvoice(mine, ym, c.closing_day);
      return { client: c, inv, count: mine.length };
    })
    .filter((s) => s.count > 0);

  const grand = summaries.reduce((s, x) => s + x.inv.total, 0);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-[--color-dim] underline">
            ← ダッシュボード
          </Link>
          <h1 className="text-2xl font-bold tracking-widest">請求</h1>
          <p className="mt-1 text-sm text-[--color-dim]">派遣台帳から自動生成。取引先ごとの締め日を反映します</p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <input
            type="month"
            name="ym"
            defaultValue={ym}
            className="rounded-lg border border-[--color-line] bg-white px-3 py-1.5 text-sm"
          />
          <button className="rounded-lg border border-[--color-line] px-3 py-1.5 text-sm">表示</button>
        </form>
      </header>

      <section className={cardCls}>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">{ym} の請求（{summaries.length}件）</h2>
          <p className="text-sm">
            合計（税込） <b className="tabular-nums">{yen(grand)}</b>
          </p>
        </div>

        {summaries.length === 0 ? (
          <p className="text-sm text-[--color-dim]">この月に請求対象の派遣はありません</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[--color-dim]">
              <tr>
                <th className="pb-2">取引先</th>
                <th className="pb-2">締切日</th>
                <th className="pb-2">振込日</th>
                <th className="pb-2 text-right">人工</th>
                <th className="pb-2 text-right">小計</th>
                <th className="pb-2 text-right">税</th>
                <th className="pb-2 text-right">合計</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => (
                <tr key={s.client.id} className="border-t border-[--color-line]">
                  <td className="py-2">{s.client.name}</td>
                  <td className="py-2 tabular-nums">{s.inv.closingDate}</td>
                  <td className="py-2">{s.client.payment_day || "—"}</td>
                  <td className="py-2 text-right tabular-nums">{s.count}</td>
                  <td className="py-2 text-right tabular-nums">{yen(s.inv.subtotal)}</td>
                  <td className="py-2 text-right tabular-nums">{yen(s.inv.tax)}</td>
                  <td className="py-2 text-right font-bold tabular-nums">{yen(s.inv.total)}</td>
                  <td className="py-2 text-right">
                    <Link
                      href={`/invoices/${s.client.id}?ym=${ym}`}
                      className="rounded-lg border border-[--color-line] px-3 py-1 text-xs"
                    >
                      請求書を開く
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="mt-4 text-xs text-[--color-dim]">
        ※ 西宮高原ゴルフ倶楽部は「20日締め」のため、締切日が月末になりません（マスタの締め日を参照しています）。
      </p>
    </main>
  );
}
