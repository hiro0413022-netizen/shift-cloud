import Link from "next/link";
import { requireMoneyActor } from "@/lib/auth";
import { getCurrentStore } from "@/lib/money";
import { loadPivot, readParams, toQuery, rangeLabel, jstMonth, type PivotParams } from "@/lib/pivot-load";
import { sortChoices } from "@/lib/pivot-params";
import { DIMS, cellKey, defaultSort, unitPrice, type Cell, type Dim, type SortKey } from "@/lib/pivot";
import { Panel, Empty, PageHeader, SubTabs, btnGhostCls, yen } from "@/components/ui";
import { PivotControls } from "./PivotControls";

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
    { label: "パーソナル × 担当（今月）", p: { rows: "pro", cols: null, q: "パーソナル", cat: "", from: thisMonth, to: thisMonth, sort: "count", dir: "desc" } },
    { label: "パーソナル × 担当 × 月（半年）", p: { rows: "pro", cols: "month", q: "パーソナル", cat: "", from: jstMonth(-5), to: thisMonth, sort: "count", dir: "desc" } },
    { label: "商品の売れ筋（今月）", p: { rows: "item", cols: null, q: "", cat: "", from: thisMonth, to: thisMonth, ...defaultSort("item") } },
    { label: "担当 × 区分（今月）", p: { rows: "pro", cols: "category", q: "", cat: "", from: thisMonth, to: thisMonth, ...defaultSort("pro") } },
    { label: "払い方 × 月（半年）", p: { rows: "pay", cols: "month", q: "", cat: "", from: jstMonth(-5), to: thisMonth, ...defaultSort("pay") } },
  ];
  const href = (over: Partial<PivotParams>) => `/analysis/table?${toQuery({ ...p, ...over })}`;
  const presetOn = (x: Partial<PivotParams>) =>
    x.rows === p.rows && x.cols === p.cols && x.q === p.q && !p.cat && x.from === p.from && x.to === p.to;

  // 見出しを押して並べ替える: いまの並びなら逆に、違えばその項目の自然な向きで
  const sortHref = (key: SortKey) =>
    href({ sort: key, dir: p.sort === key ? (p.dir === "desc" ? "asc" : "desc") : key === "label" ? "asc" : "desc" });
  const arrow = (key: SortKey) => (p.sort === key ? (p.dir === "desc" ? " ▼" : " ▲") : "");
  const sortNow = (() => {
    if (p.sort.startsWith("col:")) {
      const c = pivot?.cols.find((x) => `col:${x.key}` === p.sort);
      if (c) return `「${c.label}」の金額が${p.dir === "desc" ? "多い順" : "少ない順"}`;
    }
    const c = sortChoices(p.rows).find((x) => x.key === p.sort);
    return c ? `${c.label}の${p.dir === "desc" ? c.desc : c.asc}` : "";
  })();

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
            <Link
              key={x.label}
              href={href(x.p)}
              className={`rounded-full border px-4 py-2 text-sm font-medium ${
                presetOn(x.p) ? "border-(--color-gold) bg-(--color-gold-soft) text-(--color-gold)" : "border-(--color-line) bg-white hover:border-(--color-gold) hover:bg-(--color-gold-soft)"
              }`}
            >
              {x.label}
            </Link>
          ))}
        </div>
      </Panel>

      <Panel title="条件と並び順" hint="ボタンを押すとすぐ表が変わります">
        <PivotControls
          params={p}
          categories={categories}
          canManageAll={actor.canManageAll}
          storeName={store?.name ?? null}
          colLabels={Object.fromEntries((pivot?.cols ?? []).map((c) => [c.key, c.label]))}
        />
      </Panel>

      {!pivot ? (
        <Panel><Empty>店舗が選択されていません。メニューの店舗から選んでください</Empty></Panel>
      ) : (
        <Panel
          title={`${DIMS[p.rows]}${p.cols ? ` × ${DIMS[p.cols]}` : ""}${p.q ? `（「${p.q}」を含む）` : ""}${p.cat ? `（${p.cat}）` : ""} — ${rangeLabel(p)}`}
          hint={`${sortNow}で並べています。見出し（▲▼）を押しても並べ替えられます。金額は税抜。件数＝お会計の数、回数＝個数の合計（パーソナル2回分を1回のお会計で入れたら 1件・2回）`}
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
                    <th className="sticky left-0 z-20 border-b border-r border-(--color-line) bg-(--color-panel-2) p-0 text-left font-semibold">
                      <SortLink href={sortHref("label")} on={p.sort === "label"} left>{DIMS[p.rows]}{arrow("label")}</SortLink>
                    </th>
                    {pivot.cols.map((c) => (
                      <th key={c.key} className="whitespace-nowrap border-b border-(--color-line) p-0 text-right font-semibold">
                        <SortLink href={sortHref(`col:${c.key}`)} on={p.sort === `col:${c.key}`}>{c.label}{arrow(`col:${c.key}`)}</SortLink>
                      </th>
                    ))}
                    <th className="whitespace-nowrap border-b border-l border-(--color-line) p-0 text-right font-bold">
                      <SortLink href={sortHref("amount")} on={p.sort === "amount"}>合計{arrow("amount")}</SortLink>
                    </th>
                    <th className="whitespace-nowrap border-b border-(--color-line) p-0 text-right font-semibold">
                      <SortLink href={sortHref("count")} on={p.sort === "count"}>件数{arrow("count")}</SortLink>
                    </th>
                    <th className="whitespace-nowrap border-b border-(--color-line) p-0 text-right font-semibold text-(--color-dim)">
                      <SortLink href={sortHref("unit")} on={p.sort === "unit"}>1回あたり{arrow("unit")}</SortLink>
                    </th>
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
                        <span className="font-bold tabular-nums">{yen(r.total.amount)}</span>
                      </td>
                      <td className="px-3 py-2 text-right align-top tabular-nums">
                        {r.total.count}件{r.total.qty !== r.total.count && <span className="block text-xs text-(--color-dim)">{r.total.qty}回</span>}
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
                    <td className="border-l border-(--color-line) px-3 py-2 text-right align-top font-bold tabular-nums">{yen(pivot.grand.amount)}</td>
                    <td className="px-3 py-2 text-right align-top font-bold tabular-nums">
                      {pivot.grand.count}件{pivot.grand.qty !== pivot.grand.count && <span className="block text-xs font-normal text-(--color-dim)">{pivot.grand.qty}回</span>}
                    </td>
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

function SortLink({ href, on, left = false, children }: { href: string; on: boolean; left?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      title="押すと並べ替え（もう一度押すと逆）"
      className={`block px-3 py-2 underline-offset-4 hover:bg-(--color-gold-soft) hover:underline ${left ? "text-left" : "text-right"} ${on ? "text-(--color-gold)" : ""}`}
    >
      {children}
    </Link>
  );
}
