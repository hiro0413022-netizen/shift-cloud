import Link from "next/link";
import { requireMoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore, latestCashBalance } from "@/lib/money";
import { Panel, Empty, yen, inputCls, btnCls, btnGhostCls, PageHeader, SubTabs, CASH_TABS, Field } from "@/components/ui";
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
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // JST（UTCだと朝9時まで前日になる）

  return (
    <div className="space-y-5">
      <PageHeader
        title="レジのお金"
        store={store?.name ?? "店舗未選択"}
        lead="レジからお金を出した・入れたときに記録します（経理では「現金出納」と呼びます）。現金の売上は自動で入るので、ここに入れるのはそれ以外です。"
      />
      <SubTabs items={CASH_TABS} current="cash" />

      <Panel title="いまレジにあるはずの金額" hint="これまでの出し入れから自動で計算しています">
        <p className="text-3xl font-bold tabular-nums">{yen(balance)} <span className="text-lg">円</span></p>
      </Panel>

      <Panel title="お金の出し入れを記録する" hint="例: 両替・備品を現金で買った・返金した・銀行に預けた">
        {!store ? (
          <Empty>店舗が選択されていません。メニューの店舗から選んでください</Empty>
        ) : (
          <form action={addCashEntry} className="space-y-3">
            <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 sm:grid-cols-4">
              <Field label="日付">
                <input type="date" name="entry_date" defaultValue={today} className={inputCls} required />
              </Field>
              <Field label="何のお金か" hint="例: 返金・備品・両替">
                <input name="summary" className={inputCls} />
              </Field>
              <Field label="入れたお金（入金）">
                <input name="in_amount" inputMode="numeric" placeholder="0" className={inputCls} />
              </Field>
              <Field label="出したお金（出金）">
                <input name="out_amount" inputMode="numeric" placeholder="0" className={inputCls} />
              </Field>
              <Field label="内容（任意）">
                <input name="description" className={inputCls} />
              </Field>
              <Field label="相手・お客様（任意）">
                <input name="counterpart" className={inputCls} />
              </Field>
              <Field label="メモ（任意）" className="col-span-2">
                <input name="memo" className={inputCls} />
              </Field>
            </div>
            <button className={`${btnCls} w-full py-3 sm:w-auto`}>記録する</button>
          </form>
        )}
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={qs({ month: shift(month, -1) })} className={btnGhostCls}>← 前の月</Link>
        <span className="min-w-28 text-center text-lg font-bold tabular-nums">{Number(month.slice(0, 4))}年{Number(month.slice(5))}月</span>
        <Link href={qs({ month: shift(month, 1) })} className={btnGhostCls}>次の月 →</Link>
      </div>
      <Panel title="見る期間">
        <RangePicker basePath="/cash" month={month} preset={preset} from={sp.from ?? null} to={sp.to ?? null} />
      </Panel>

      <Panel title={`これまでの出し入れ（${range.label}）`}>
        {rows.length === 0 ? (
          <Empty>この期間の記録はまだありません</Empty>
        ) : (
          <CashTable rows={rows} />
        )}
      </Panel>
    </div>
  );
}
