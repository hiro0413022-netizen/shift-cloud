import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { cardCls } from "@/components/ui";
import { createAdmin } from "@yozan/core/supabase/admin";
import { currentYm, ymRange, yen } from "@/lib/caddy";
import { InvoiceTabs } from "../tabs";
import { CsvButton } from "./csv-button";

export const dynamic = "force-dynamic";

/** 支払サマリ（委託先ごと・月次）。キャディ→YOZAN 請求書のもと */
export default async function PayablePage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const ym = sp.ym ?? currentYm();
  const { from, to } = ymRange(ym);

  const admin = createAdmin();
  const [{ data: rows }, { data: invoices }] = await Promise.all([
    admin
      .from("cad_dispatches")
      .select("partner_id, kind, fee_amount, transport_amount, special_amount, cad_partners(code, name)")
      .eq("company_id", actor.companyId)
      .gte("dispatch_date", from)
      .lte("dispatch_date", to)
      .is("deleted_at", null)
      .not("partner_id", "is", null),
    admin
      .from("cad_invoices")
      .select("partner_id, status, total")
      .eq("company_id", actor.companyId)
      .eq("kind", "payable")
      .eq("target_month", `${ym}-01`)
      .is("deleted_at", null),
  ]);

  type R = {
    partner_id: string;
    kind: string;
    fee_amount: number;
    transport_amount: number;
    special_amount: number;
    cad_partners: { code: string | null; name: string } | null;
  };
  const map = new Map<
    string,
    { id: string; code: string; name: string; count: number; gw: number; fee: number; transport: number; special: number; total: number }
  >();
  for (const r of (rows ?? []) as unknown as R[]) {
    if (!r.partner_id) continue;
    const cur =
      map.get(r.partner_id) ??
      { id: r.partner_id, code: r.cad_partners?.code ?? "", name: r.cad_partners?.name ?? "（不明）", count: 0, gw: 0, fee: 0, transport: 0, special: 0, total: 0 };
    cur.count += 1;
    if (r.kind === "golfwing") cur.gw += 1;
    cur.fee += r.fee_amount;
    cur.transport += r.transport_amount;
    cur.special += r.special_amount;
    cur.total += r.fee_amount + r.transport_amount + r.special_amount;
    map.set(r.partner_id, cur);
  }
  const summaries = [...map.values()].sort((a, b) => b.total - a.total);
  const grand = summaries.reduce((s, x) => s + x.total, 0);

  const invByPartner = new Map<string, { status: string }>();
  for (const iv of (invoices ?? []) as Array<{ partner_id: string; status: string }>) {
    invByPartner.set(iv.partner_id, { status: iv.status });
  }
  const statusLabel: Record<string, string> = { issued: "発行済", sent: "送付済", paid: "支払済", void: "取消" };

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-(--color-dim) underline">
            ← ダッシュボード
          </Link>
          <h1 className="text-2xl font-bold tracking-widest">支払（キャディ→YOZAN）</h1>
          <p className="mt-1 text-sm text-(--color-dim)">
            委託先が YOZAN へ上げる請求書のもと。委託料＋交通費＋特別手当＋ゴルフウィング時給。消費税なし（免税）
          </p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <input type="month" name="ym" defaultValue={ym} className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm" />
          <button className="rounded-lg border border-(--color-line) px-3 py-1.5 text-sm">表示</button>
        </form>
      </header>

      <InvoiceTabs active="payable" ym={ym} />

      <section className={cardCls}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">
            {ym} の支払（{summaries.length}名）
          </h2>
          <div className="flex items-center gap-3">
            <p className="text-sm">
              合計 <b className="tabular-nums">{yen(grand)}</b>
            </p>
            <CsvButton rows={summaries.map((s) => ({ code: s.code, name: s.name, count: s.count, fee: s.fee, transport: s.transport, special: s.special, total: s.total }))} ym={ym} />
          </div>
        </div>

        {summaries.length === 0 ? (
          <p className="text-sm text-(--color-dim)">この月に支払対象の派遣はありません</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-(--color-dim)">
              <tr>
                <th className="pb-2">委託先</th>
                <th className="pb-2 text-right">件数</th>
                <th className="pb-2 text-right">委託料</th>
                <th className="pb-2 text-right">交通費</th>
                <th className="pb-2 text-right">手当</th>
                <th className="pb-2 text-right">支払合計</th>
                <th className="pb-2 text-center">状態</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s) => {
                const iv = invByPartner.get(s.id);
                return (
                  <tr key={s.id} className="border-t border-(--color-line)">
                    <td className="py-2">
                      {s.name}
                      {s.gw > 0 ? <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] text-emerald-800">GW{s.gw}</span> : null}
                    </td>
                    <td className="py-2 text-right tabular-nums">{s.count}</td>
                    <td className="py-2 text-right tabular-nums">{yen(s.fee)}</td>
                    <td className="py-2 text-right tabular-nums">{yen(s.transport)}</td>
                    <td className="py-2 text-right tabular-nums">{yen(s.special)}</td>
                    <td className="py-2 text-right font-bold tabular-nums">{yen(s.total)}</td>
                    <td className="py-2 text-center">
                      {iv ? (
                        <span className={`rounded px-1.5 py-0.5 text-[11px] ${iv.status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                          {statusLabel[iv.status] ?? iv.status}
                        </span>
                      ) : (
                        <span className="text-[11px] text-(--color-dim)">未発行</span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Link href={`/invoices/payable/${s.id}?ym=${ym}`} className="rounded-lg border border-(--color-line) px-3 py-1 text-xs">
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
    </main>
  );
}
