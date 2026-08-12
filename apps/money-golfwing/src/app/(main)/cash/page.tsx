import Link from "next/link";
import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore, latestCashBalance } from "@/lib/money";
import { Panel, Empty, yen, inputCls, btnCls, btnGhostCls } from "@/components/ui";
import { addCashEntry } from "./actions";
import CashTable from "./CashTable";
import RangePicker from "@/components/RangePicker";
import { resolveRange, type RangePreset } from "@/lib/table-filter";

export const dynamic = "force-dynamic";

type Row = {
  id: string; entry_date: string; summary: string | null; description: string | null;
  counterpart: string | null; in_amount: number; out_amount: number; balance: number | null; source: string;
};

function ym(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }
function shift(y: string, n: number) { const [a, m] = y.split("-").map(Number); return ym(new Date(a, m - 1 + n, 1)); }

export default async function CashPage({ searchParams }: {
  searchParams: Promise<{ month?: string; range?: string; from?: string; to?: string }>;
}) {
  const actor = await requireMoneyActor();
  const admin = createAdmin();
  const store = await getCurrentStore(actor);
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? (sp.month as string) : ym(new Date());
  const preset: RangePreset = (["month", "3m", "6m", "year", "all", "custom"] as const)
    .includes(sp.range as RangePreset) ? (sp.range as RangePreset) : "month";
  const range = resolveRange({ preset, month, from: sp.from, to: sp.to });
  const { from, to } = range;

  const { data } = store
    ? await admin.from("mon_cash_ledger").select("*")
        .eq("company_id", actor.companyId).eq("store_id", store.id)
        .gte("entry_date", from).lt("entry_date", to).is("deleted_at", null)
        .order("entry_date", { ascending: true }).order("created_at", { ascending: true })
        .limit(4000)
    : { data: [] };
  const rows = (data ?? []) as Row[];
  /** 前月/翌月リンクで期間の指定を落とさない */
  const qs = (over: { month?: string }) => {
    const p = new URLSearchParams();
    p.set("month", over.month ?? month);
    if (preset !== "month") p.set("range", preset);
    if (preset === "custom") { if (sp.from) p.set("from", sp.from); if (sp.to) p.set("to", sp.to); }
    return `/cash?${p.toString()}`;
  };
  const balance = store ? await latestCashBalance(actor.companyId, store.id) : 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">現金出納 — {store?.name ?? "店舗未選択"}</h1>
          <p className="text-sm text-(--color-dim)">入金・出金を入力すると残高が自動計算されます</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={qs({ month: shift(month, -1) })} className={btnGhostCls}>← 前月</Link>
          <span className="min-w-24 text-center font-bold tabular-nums">{month}</span>
          <Link href={qs({ month: shift(month, 1) })} className={btnGhostCls}>翌月 →</Link>
        </div>
      </header>

      <Panel title="現在の現金残高">
        <p className="text-3xl font-bold tabular-nums">{yen(balance)} 円</p>
      </Panel>

      <Panel title="表示する期間">
        <RangePicker basePath="/cash" month={month} preset={preset} from={sp.from ?? null} to={sp.to ?? null} />
      </Panel>

      <Panel title="出納を追加">
        {!store ? (
          <Empty>店舗が選択されていません。上部の店舗切替で選んでください</Empty>
        ) : (
          <form action={addCashEntry} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input type="date" name="entry_date" defaultValue={today} className={inputCls} required />
            <input name="summary" placeholder="摘要（利用料/返金/備品…）" className={inputCls} />
            <input name="description" placeholder="内容" className={inputCls} />
            <input name="counterpart" placeholder="相手・お客様" className={inputCls} />
            <input name="in_amount" inputMode="numeric" placeholder="入金" className={inputCls} />
            <input name="out_amount" inputMode="numeric" placeholder="出金" className={inputCls} />
            <input name="memo" placeholder="備考" className={inputCls} />
            <button className={`${btnCls} justify-center`}>追加</button>
          </form>
        )}
      </Panel>

      <Panel title={`出納帳（${range.label}）`}>
        {rows.length === 0 ? (
          <Empty>この期間の記録はまだありません</Empty>
        ) : (
          <CashTable rows={rows} />
        )}
      </Panel>
    </div>
  );
}
