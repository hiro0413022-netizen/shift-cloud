import Link from "next/link";
import { requireMoneyActor } from "@/lib/auth";
import { getCurrentStore } from "@/lib/money";
import { loadPivot, readParams, toQuery, rangeLabel, jstMonth, type PivotParams } from "@/lib/pivot-load";
import { DIMS, cellKey, unitPrice, type Cell, type Dim } from "@/lib/pivot";
import { Panel, Empty, PageHeader, SubTabs, inputCls, btnCls, btnGhostCls, yen } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * 売上の集計表（#285・2026-09-28）
 * ユーザー依頼「エクセル一覧のように。例えばパーソナルが、どの担当が何件でいくらか分かるように」
 *
 *   行（縦）と列（横）に好きな項目を選び、件数・回数・金額を数える（Excelのピボットと同じ考え方）。
 *   よく使う形は「よく使う表」から1回で出せる。そのままExcel（CSV）にも書き出せる。
 */

const ANALYSIS_TABS = [
  { key: "graph", href: "/analysis", label: "まとめて見る" },
  { key: "table", href: "/analysis/table", label: "表で見る（Excelのように）" },
];

const ROW_DIMS: Dim[] = ["pro", "item", "type", "category", "customer", "memberKind", "pay", "month", "date"];
const COL_DIMS: (Dim | "none")[] = ["none", "month", "category", "pro", "memberKind", "pay", "type"];

export default async function PivotPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireMoneyActor();
  const store = await getCurrentStore(actor);
  const sp = await searchParams;
  const p = readParams(sp);
  const storeId = actor.canManageAll && p.scope === "all" ? null : (store?.id ?? null);

  const { pivot, categories, rowCount } = !actor.canManageAll && !storeId
    ? { pivot: null, categories: [] as string[], rowCount: 0 }
    : await loadPivot(actor.companyId, storeId, p);

  const thisMonth = jstMonth(0);
  const presets: { label: string; p: Partial<PivotParams> }[] = [
    { label: "パーソナル × 担当（今月）", p: { rows: "pro", cols: null, q: "パーソナル", cat: "", from: thisMonth, to: thisMonth } },
    { label: "パーソナル × 担当 × 月（半年）", p: { rows: "pro", cols: "month", q: "パーソナル", cat: "", from: jstMonth(-5), to: thisMonth } },
    { label: "商品の売れ筋（今月）", p: { rows: "item", cols: null, q: "", cat: "", from: thisMonth, to: thisMonth } },
    { label: "担当 × 区分（今月）", p: { rows: "pro", cols: "category", q: "", cat: "", from: thisMonth, to: thisMonth } },
    { label: "払い方 × 月（半年）", p: { rows: "pay", cols: "month", q: "", cat: "", from: jstMonth(-5), to: thisMonth } },
  ];
  const href = (over: Partial<PivotParams>) => `/analysis/table?${toQuery({ ...p, ...over })}`;
  const period: { label: string; from: string; to: string }[] = [
    { label: "今月", from: thisMonth, to: thisMonth },
    { label: "先月", from: jstMonth(-1), to: jstMonth(-1) },
    { label: "3か月", from: jstMonth(-2), to: thisMonth },
    { label: "半年", from: jstMonth(-5), to: thisMonth },
    { label: "1年", from: jstMonth(-11), to: thisMonth },
  ];

  const scopeLabel = actor.canManageAll ? (p.scope === "all" ? "全店" : (store?.name ?? "店舗未選択")) : (store?.name ?? "店舗未選択");

  return (
    <div className="space-y-5">
      <PageHeader
        title="売上を見る"
        store={scopeLabel}
        lead="縦と横に好きな項目を並べて、件数・回数・金額を一覧にします（Excelのピボットと同じです）。"
      />
      <SubTabs items={ANALYSIS_TABS} current="table" />

      <Panel title="よく使う表" hint="押すとその表になります">
        <div className="flex flex-wrap gap-2">
          {presets.map((x) => (
            <Link key={x.label} href={href(x.p)} className="rounded-full border border-(--color-line) bg-white px-4 py-2 text-sm font-medium hover:border-(--color-gold) hover:bg-(--color-gold-soft)">
              {x.label}
            </Link>
          ))}
        </div>
      </Panel>

      <Panel title="条件">
        <form method="get" className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))]">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">縦に並べる（行）</span>
              <select name="rows" defaultValue={p.rows} className={inputCls}>
                {ROW_DIMS.map((d) => <option key={d} value={d}>{DIMS[d]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">横に並べる（列）</span>
              <select name="cols" defaultValue={p.cols ?? "none"} className={inputCls}>
                {COL_DIMS.map((d) => <option key={d} value={d}>{d === "none" ? "（なし＝合計だけ）" : DIMS[d]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">商品名などで絞る</span>
              <input name="q" defaultValue={p.q} placeholder="例: パーソナル" className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">区分で絞る</span>
              <select name="cat" defaultValue={p.cat} className={inputCls}>
                <option value="">すべて</option>
                {[...new Set([...categories, ...(p.cat ? [p.cat] : [])])].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">いつから</span>
              <input type="month" name="from" defaultValue={p.from} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">いつまで</span>
              <input type="month" name="to" defaultValue={p.to} className={inputCls} />
            </label>
            {actor.canManageAll && (
              <label className="block">
                <span className="mb-1 block text-sm font-medium">店舗</span>
                <select name="scope" defaultValue={p.scope} className={inputCls}>
                  <option value="all">全店</option>
                  <option value="store">{store?.name ?? "選んでいる店舗"}だけ</option>
                </select>
              </label>
            )}
            <div className="flex items-end">
              <button className={`${btnCls} w-full`}>この条件で表示</button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-(--color-dim)">期間:</span>
            {period.map((x) => (
              <Link
                key={x.label}
                href={href({ from: x.from, to: x.to })}
                className={`rounded-md border px-3 py-1.5 ${p.from === x.from && p.to === x.to ? "border-(--color-gold) bg-(--color-gold) text-white" : "border-(--color-line) bg-white hover:border-(--color-gold)"}`}
              >
                {x.label}
              </Link>
            ))}
          </div>
        </form>
      </Panel>

      {!pivot ? (
        <Panel><Empty>店舗が選択されていません。メニューの店舗から選んでください</Empty></Panel>
      ) : (
        <Panel
          title={`${DIMS[p.rows]}${p.cols ? ` × ${DIMS[p.cols]}` : ""}${p.q ? `（「${p.q}」を含む）` : ""}${p.cat ? `（${p.cat}）` : ""} — ${rangeLabel(p)}`}
          hint="金額は税抜。件数＝お会計の数、回数＝個数の合計（パーソナル2回分を1回のお会計で入れたら 1件・2回）"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              合計 <strong className="text-lg tabular-nums">{yen(pivot.grand.amount)}円</strong>
              <span className="ml-2 text-(--color-dim)">{pivot.grand.count}件・{pivot.grand.qty}回</span>
            </p>
            <a href={`/api/analysis/pivot?${toQuery(p)}`} className={btnGhostCls}>Excelで開く（CSV）</a>
          </div>

          {rowCount === 0 ? (
            <Empty>この条件の売上はありません。期間や言葉を変えてみてください</Empty>
          ) : (
            <div className="max-h-[70vh] overflow-auto rounded-lg border border-(--color-line)">
              <table className="min-w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-(--color-panel-2)">
                  <tr>
                    <th className="sticky left-0 z-20 border-b border-r border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-left font-semibold">
                      {DIMS[p.rows]}
                    </th>
                    {pivot.cols.map((c) => (
                      <th key={c.key} className="whitespace-nowrap border-b border-(--color-line) px-3 py-2 text-right font-semibold">{c.label}</th>
                    ))}
                    <th className="whitespace-nowrap border-b border-l border-(--color-line) px-3 py-2 text-right font-bold">合計</th>
                    <th className="whitespace-nowrap border-b border-(--color-line) px-3 py-2 text-right font-semibold text-(--color-dim)">1回あたり</th>
                  </tr>
                </thead>
                <tbody>
                  {pivot.rows.map((r) => (
                    <tr key={r.key} className="border-b border-(--color-line) hover:bg-(--color-gold-soft)/50">
                      <th className="sticky left-0 z-[5] max-w-64 truncate border-r border-(--color-line) bg-white px-3 py-2 text-left font-medium" title={r.label}>
                        {r.label}
                      </th>
                      {pivot.cols.map((c) => (
                        <td key={c.key} className="px-3 py-2 text-right align-top">
                          <CellView c={pivot.cells.get(cellKey(r.key, c.key))} />
                        </td>
                      ))}
                      <td className="border-l border-(--color-line) bg-(--color-panel-2)/60 px-3 py-2 text-right align-top">
                        <CellView c={r.total} strong />
                      </td>
                      <td className="px-3 py-2 text-right align-top tabular-nums text-(--color-dim)">{yen(unitPrice(r.total))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-(--color-panel-2)">
                  <tr className="border-t-2 border-(--color-line)">
                    <th className="sticky left-0 z-[5] border-r border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-left font-bold">合計</th>
                    {pivot.cols.map((c) => (
                      <td key={c.key} className="px-3 py-2 text-right align-top"><CellView c={c.total} strong /></td>
                    ))}
                    <td className="border-l border-(--color-line) px-3 py-2 text-right align-top"><CellView c={pivot.grand} strong /></td>
                    <td className="px-3 py-2 text-right align-top tabular-nums text-(--color-dim)">{yen(unitPrice(pivot.grand))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-(--color-dim)">
            この画面で入れた売上・売上台帳・FRANKのSquareの取引を数えています。月会費の見込み（まだ入っていないお金）は入れていません。
            担当の「古川プロ」「古川」のような書き方の違いはまとめています。
          </p>
        </Panel>
      )}
    </div>
  );
}

function CellView({ c, strong = false }: { c?: Cell; strong?: boolean }) {
  if (!c || c.count === 0) return <span className="text-(--color-line)">—</span>;
  return (
    <span className="block whitespace-nowrap tabular-nums">
      <span className={strong ? "font-bold" : "font-semibold"}>{yen(c.amount)}</span>
      <span className="block text-xs text-(--color-dim)">
        {c.count}件{c.qty !== c.count ? `・${c.qty}回` : ""}
      </span>
    </span>
  );
}
