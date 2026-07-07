import Link from "next/link";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, Field, inputCls, btnCls, btnGhostCls, Sparkline } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { upsertEntry, deleteEntry, importCsv, importLaborFromShiftCloud } from "./actions";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function monthStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function shiftMonth(ym: string, diff: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + diff, 1);
  return monthStr(d);
}
function yen(n: number): string {
  return `${n < 0 ? "▲" : ""}${Math.abs(n).toLocaleString("ja-JP")}`;
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const sp = await searchParams;
  let ym = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? (sp.month as string) : "";
  if (!ym) {
    // 月指定が無ければ、データのある最新月を初期表示（当月は未入力で空になりがちなため）
    const { data: latest } = await admin
      .from("fin_entries")
      .select("target_month")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("target_month", { ascending: false })
      .limit(1);
    const lm = latest?.[0]?.target_month as string | undefined;
    ym = lm ? String(lm).slice(0, 7) : monthStr(new Date());
  }
  const monthDate = `${ym}-01`;

  const [{ data: segments }, { data: categories }, { data: entries }, { data: yearEntries }] = await Promise.all([
    admin.from("fin_segments").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("sort_order"),
    admin.from("fin_categories").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("sort_order"),
    admin.from("fin_entries").select("*").eq("company_id", actor.companyId).eq("target_month", monthDate).is("deleted_at", null),
    admin
      .from("fin_entries")
      .select("target_month, amount, category_id")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .gte("target_month", `${shiftMonth(ym, -11)}-01`)
      .lte("target_month", monthDate),
  ]);

  const segs = (segments ?? []) as Row[];
  const cats = (categories ?? []) as Row[];
  const ents = (entries ?? []) as Row[];
  const kindOf = new Map(cats.map((c) => [String(c.id), String(c.kind)]));

  // 当月: セグメント×科目 → 金額
  const cell = new Map<string, number>();
  for (const e of ents) {
    cell.set(`${e.segment_id}:${e.category_id}`, Number(e.amount));
  }
  const catTotal = (catId: string) => segs.reduce((a, s) => a + (cell.get(`${s.id}:${catId}`) ?? 0), 0);
  const segSum = (segId: string, kinds: string[]) =>
    cats.filter((c) => kinds.includes(String(c.kind))).reduce((a, c) => a + (cell.get(`${segId}:${c.id}`) ?? 0), 0);

  const totalRevenue = segs.reduce((a, s) => a + segSum(String(s.id), ["revenue"]), 0);
  const totalCost = segs.reduce((a, s) => a + segSum(String(s.id), ["cogs", "expense"]), 0);
  const totalProfit = totalRevenue - totalCost;

  // 12ヶ月推移（売上・営業利益）
  const byMonth = new Map<string, { rev: number; cost: number }>();
  for (const e of (yearEntries ?? []) as Row[]) {
    const m = String(e.target_month);
    const cur = byMonth.get(m) ?? { rev: 0, cost: 0 };
    if (kindOf.get(String(e.category_id)) === "revenue") cur.rev += Number(e.amount);
    else cur.cost += Number(e.amount);
    byMonth.set(m, cur);
  }
  const months = [...byMonth.keys()].sort();
  const revTrend = months.map((m) => ({ date: m, value: byMonth.get(m)!.rev }));
  const profitTrend = months.map((m) => ({ date: m, value: byMonth.get(m)!.rev - byMonth.get(m)!.cost }));

  const hasData = ents.length > 0;

  return (
    <div className="space-y-4">
      <header className="reveal flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Finance — 事業別月次PL</h1>
          <p className="text-sm text-[--color-dim]">税理士データの手入力＋CSV取込 → 売上・利益KPIに自動反映</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/finance?month=${shiftMonth(ym, -1)}`} className={btnGhostCls}>← 前月</Link>
          <span className="min-w-24 text-center text-lg font-bold tabular-nums">{ym.replace("-", "年")}月</span>
          <Link href={`/finance?month=${shiftMonth(ym, 1)}`} className={btnGhostCls}>翌月 →</Link>
        </div>
      </header>

      {/* サマリ */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="売上（当月）" value={totalRevenue} trend={revTrend} tone="accent" />
        <SummaryCard label="費用（当月）" value={totalCost} trend={[]} tone="gold" />
        <SummaryCard label="営業利益（当月）" value={totalProfit} trend={profitTrend} tone={totalProfit >= 0 ? "ok" : "accent"} negative={totalProfit < 0} />
      </div>

      {/* PLテーブル */}
      <Panel title={`事業別PL（${ym.replace("-", "/")}）`} className="d1">
        {!hasData ? (
          <Empty>この月の実績はまだありません。下のフォームかCSV取込で追加してください</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-[--color-line] text-xs text-[--color-dim]">
                  <th className="py-2 pr-2 text-left font-medium">科目</th>
                  {segs.map((s) => (
                    <th key={String(s.id)} className="px-2 py-2 text-right font-medium">{String(s.name)}</th>
                  ))}
                  <th className="px-2 py-2 text-right font-semibold text-[--color-txt]">合計</th>
                </tr>
              </thead>
              <tbody>
                {(["revenue", "cogs", "expense"] as const).map((kind) =>
                  cats
                    .filter((c) => c.kind === kind)
                    .map((c) => {
                      const total = catTotal(String(c.id));
                      if (total === 0) return null;
                      return (
                        <tr key={String(c.id)} className="border-b border-[--color-line]/50">
                          <td className="py-1.5 pr-2">
                            {String(c.name)}
                            {kind === "revenue" && <Badge tone="accent">収益</Badge>}
                          </td>
                          {segs.map((s) => {
                            const v = cell.get(`${s.id}:${c.id}`) ?? 0;
                            return (
                              <td key={String(s.id)} className="px-2 py-1.5 text-right text-[--color-dim]">
                                {v !== 0 ? yen(v) : "–"}
                              </td>
                            );
                          })}
                          <td className="px-2 py-1.5 text-right font-medium">{yen(total)}</td>
                        </tr>
                      );
                    })
                )}
                <tr className="border-t border-[--color-line] font-semibold">
                  <td className="py-2 pr-2 text-sky-300">営業利益</td>
                  {segs.map((s) => {
                    const p = segSum(String(s.id), ["revenue"]) - segSum(String(s.id), ["cogs", "expense"]);
                    return (
                      <td key={String(s.id)} className={`px-2 py-2 text-right ${p < 0 ? "text-red-300" : "text-emerald-300"}`}>
                        {p !== 0 ? yen(p) : "–"}
                      </td>
                    );
                  })}
                  <td className={`px-2 py-2 text-right ${totalProfit < 0 ? "text-red-300" : "text-emerald-300"}`}>{yen(totalProfit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 手入力 */}
        <Panel title="実績入力（同月×事業×科目は上書き）" className="d2">
          <form action={upsertEntry} className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Field label="対象月">
                <input type="month" name="target_month" defaultValue={ym} className={inputCls} required />
              </Field>
              <Field label="事業">
                <select name="segment_id" className={inputCls}>
                  {segs.map((s) => (
                    <option key={String(s.id)} value={String(s.id)}>{String(s.name)}</option>
                  ))}
                </select>
              </Field>
              <Field label="科目">
                <select name="category_id" className={inputCls}>
                  {cats.map((c) => (
                    <option key={String(c.id)} value={String(c.id)}>{String(c.name)}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="金額（円）">
                <input name="amount" inputMode="numeric" placeholder="例: 4500000" className={inputCls} required />
              </Field>
              <Field label="メモ（任意）">
                <input name="memo" className={inputCls} />
              </Field>
            </div>
            <button className={btnCls}>保存 → KPI自動更新</button>
          </form>
          <form action={importLaborFromShiftCloud} className="mt-3 border-t border-[--color-line] pt-3">
            <input type="hidden" name="target_month" value={ym} />
            <button className={btnGhostCls}>Shift Cloud人件費概算を{ym.split("-")[1]}月に取込（本部・共通/人件費）</button>
          </form>
        </Panel>

        {/* CSV取込 */}
        <Panel title="CSV取込" className="d3">
          <form action={importCsv} className="space-y-3">
            <Field label="CSVファイル（1MBまで）">
              <input type="file" name="file" accept=".csv,text/csv" className={inputCls} required />
            </Field>
            <button className={btnCls}>取込実行</button>
          </form>
          <div className="mt-3 rounded-lg bg-black/30 p-3 text-xs leading-relaxed text-[--color-dim]">
            <p className="mb-1 font-medium text-[--color-txt]">形式: 年月,事業コード,科目コード,金額,メモ</p>
            <pre>{`2026-06,golf,sales,4500000,6月売上
2026-06,golf,rent,350000,
2026-06,kallinos,sales,820000,EC+卸`}</pre>
            <p className="mt-2">事業: {segs.map((s) => String(s.code)).join(" / ")}</p>
            <p>科目: {cats.map((c) => String(c.code)).join(" / ")}</p>
          </div>
        </Panel>
      </div>

      {/* 当月明細 */}
      <Panel title={`明細（${ym.replace("-", "/")} — ${ents.length}件）`} className="d4">
        {!hasData ? (
          <Empty>明細なし</Empty>
        ) : (
          <ul className="divide-y divide-[--color-line]/50 text-sm">
            {ents
              .sort((a, b) => Number(b.amount) - Number(a.amount))
              .map((e) => {
                const seg = segs.find((s) => s.id === e.segment_id);
                const cat = cats.find((c) => c.id === e.category_id);
                return (
                  <li key={String(e.id)} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 truncate">
                      <span className="text-[--color-dim]">{String(seg?.name ?? "?")} / </span>
                      {String(cat?.name ?? "?")}
                      {e.memo != null && <span className="ml-2 text-xs text-[--color-dim]">{String(e.memo)}</span>}
                      {String(e.source) !== "manual" && <Badge tone="gold">{String(e.source)}</Badge>}
                    </span>
                    <div className="flex shrink-0 items-center gap-3 tabular-nums">
                      <span>{yen(Number(e.amount))}円</span>
                      <form action={deleteEntry}>
                        <input type="hidden" name="id" value={String(e.id)} />
                        <button className="text-xs text-[--color-dim] hover:text-red-300">削除</button>
                      </form>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  trend,
  tone,
  negative = false,
}: {
  label: string;
  value: number;
  trend: { date: string; value: number }[];
  tone: "accent" | "gold" | "ok";
  negative?: boolean;
}) {
  return (
    <div className="hud reveal rounded-xl border border-[--color-line] bg-[--color-panel] p-4">
      <p className="text-xs tracking-wide text-[--color-dim]">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${negative ? "text-red-300" : ""}`}>
        {negative && "▲"}
        <CountUp value={Math.abs(value)} />
        <span className="ml-0.5 text-sm font-medium text-[--color-dim]">円</span>
      </p>
      {trend.length > 0 ? <Sparkline trend={trend} tone={tone} /> : <div className="h-7" />}
      <p className="mt-1 text-[11px] text-[--color-dim]">直近12ヶ月</p>
    </div>
  );
}
