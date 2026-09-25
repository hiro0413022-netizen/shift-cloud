import Link from "next/link";
import { requireMoneyActor } from "@/lib/auth";
import { getCurrentStore } from "@/lib/money";
import { Panel, Empty, Badge, yen, btnGhostCls } from "@/components/ui";
import { categoryFacts, categoryTrend, prevMonth } from "@/lib/analytics";
import { buildDrill, factsWithItem, NO_NAME, type SimpleRow } from "@/lib/sales-drill";

export const dynamic = "force-dynamic";

/**
 * 売上分析 › カテゴリ詳細（#277）
 * /analysis の「月会費」「利用料」などをタップした先。何が売れたか（品目）・日別・
 * 会員区分・支払方法・取引一覧まで見る。金額は上段カードと同じ税抜。
 * 品目をタップすると、その品目の取引だけに絞る（?item=）。
 */

function label(m: string) {
  const [y, mm] = m.split("-");
  return `${y}年${Number(mm)}月`;
}
function md(d: string) {
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
}
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
function wd(d: string) {
  return WEEK[new Date(`${d}T00:00:00Z`).getUTCDay()];
}

function Bar({ value, max, dim = false }: { value: number; max: number; dim?: boolean }) {
  const w = max > 0 ? Math.max(1, Math.round((Math.abs(value) / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-(--color-bg)">
      <div className={`h-1.5 rounded-full ${dim ? "bg-(--color-dim)" : "bg-(--color-gold)"}`} style={{ width: `${w}%`, opacity: value < 0 ? 0.4 : 1 }} />
    </div>
  );
}

function MiniTable({ rows, total, unit = "件" }: { rows: SimpleRow[]; total: number; unit?: string }) {
  if (!rows.length) return <Empty>データなし</Empty>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.name} className="text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate">{r.name}</span>
            <span className="shrink-0 tabular-nums">
              {yen(r.amount)}円
              <span className="ml-1 text-xs text-(--color-dim)">
                {r.count}{unit}・{total ? Math.round((r.amount / total) * 100) : 0}%
              </span>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function CategoryDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; cat?: string; item?: string }>;
}) {
  const actor = await requireMoneyActor();
  const store = await getCurrentStore(actor);
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? (sp.month as string) : new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7); // JST
  const cat = (sp.cat ?? "").trim();
  const itemKeyParam = (sp.item ?? "").trim();

  // /analysis と同じ範囲: 本部は全店、現場は自店舗
  const scopeStoreId = actor.canManageAll ? null : (store?.id ?? null);

  if (!cat) {
    return (
      <div className="space-y-4">
        <Link href={`/analysis?month=${month}`} className={btnGhostCls}>← 売上分析へ</Link>
        <Empty>カテゴリが指定されていません</Empty>
      </div>
    );
  }

  const [{ facts, ledgerRollup }, trend] = await Promise.all([
    categoryFacts(actor.companyId, scopeStoreId, month, cat),
    categoryTrend(actor.companyId, scopeStoreId, month, cat),
  ]);
  const drill = buildDrill(facts, month);
  const prev = trend[trend.length - 2]?.amount ?? 0;
  const trendMax = Math.max(...trend.map((t) => Math.abs(t.amount)), 1);
  const itemMax = Math.max(...drill.items.map((r) => Math.abs(r.amount)), 1);
  const dayMax = Math.max(...drill.daily.map((d) => Math.abs(d.amount)), 1);
  const topCardTotal = trend[trend.length - 1]?.amount ?? 0;
  // 台帳ロールアップ(mon_sales)と明細(lines)がずれていたら知らせる（取込後にロールアップ未実行など）
  const mismatch = ledgerRollup !== 0 && Math.round(topCardTotal) !== Math.round(drill.total);

  const selected = itemKeyParam ? drill.items.find((r) => r.key === itemKeyParam) ?? null : null;
  const list = selected ? factsWithItem(facts, selected.key) : facts;
  const LIST_MAX = 300;

  const base = `/analysis/category?month=${month}&cat=${encodeURIComponent(cat)}`;
  const delta = prev ? ((drill.total - prev) / Math.abs(prev)) * 100 : null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href={`/analysis?month=${month}`} className="text-xs text-(--color-dim) underline-offset-2 hover:underline">
            ← 売上分析
          </Link>
          <h1 className="text-xl font-bold">{cat} — {label(month)}</h1>
          <p className="text-sm text-(--color-dim)">
            {actor.canManageAll ? "全店" : (store?.name ?? "店舗未選択")} ・ 何が売れたか（税抜）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/analysis/category?month=${prevMonth(month)}&cat=${encodeURIComponent(cat)}`} className={btnGhostCls}>← 前月</Link>
          <Link href={`/analysis/category?month=${prevMonth(month, -1)}&cat=${encodeURIComponent(cat)}`} className={btnGhostCls}>翌月 →</Link>
        </div>
      </header>

      {/* ---------- まとめ ---------- */}
      <Panel>
        <div className="flex flex-wrap items-baseline gap-3">
          <p className="text-3xl font-bold tabular-nums">{yen(drill.total)}<span className="ml-1 text-base font-normal text-(--color-dim)">円</span></p>
          {delta == null ? (
            <span className="text-xs text-(--color-dim)">前月なし</span>
          ) : (
            <span className={`text-xs tabular-nums ${delta >= 0 ? "text-(--color-ok)" : "text-rose-400"}`}>
              {delta >= 0 ? "+" : ""}{delta.toFixed(1)}% <span className="text-(--color-dim)">（前月 {yen(prev)}円）</span>
            </span>
          )}
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-(--color-line) p-2">
            <dt className="text-[11px] text-(--color-dim)">取引</dt>
            <dd className="tabular-nums font-semibold">{drill.count}<span className="text-xs font-normal">件</span></dd>
          </div>
          <div className="rounded-lg border border-(--color-line) p-2">
            <dt className="text-[11px] text-(--color-dim)">点数</dt>
            <dd className="tabular-nums font-semibold">{drill.qty}<span className="text-xs font-normal">点</span></dd>
          </div>
          <div className="rounded-lg border border-(--color-line) p-2">
            <dt className="text-[11px] text-(--color-dim)">お客様</dt>
            <dd className="tabular-nums font-semibold">{drill.customers}<span className="text-xs font-normal">名</span></dd>
          </div>
        </dl>
        {/* 直近6か月 */}
        <div className="mt-4 flex h-16 items-end gap-1">
          {trend.map((t) => (
            <Link
              key={t.month}
              href={`/analysis/category?month=${t.month}&cat=${encodeURIComponent(cat)}`}
              className="flex h-full flex-1 flex-col items-center justify-end gap-0.5"
              title={`${t.month}: ${yen(t.amount)}円`}
            >
              <div
                className={`w-full rounded-t ${t.month === month ? "bg-(--color-gold)" : "bg-(--color-line)"}`}
                style={{ height: `${Math.max(3, Math.round((Math.abs(t.amount) / trendMax) * 100))}%` }}
              />
              <span className="text-[10px] text-(--color-dim)">{Number(t.month.slice(5))}月</span>
            </Link>
          ))}
        </div>
        {mismatch && (
          <p className="mt-3 text-xs text-amber-400">
            売上台帳の明細合計（{yen(drill.total)}円）と、売上分析の数字（{yen(topCardTotal)}円）がずれています。
            台帳の取込後にロールアップが済んでいない可能性があります（npm run import:sales -- --month={month} --apply）。
          </p>
        )}
      </Panel>

      {/* ---------- 品目ランキング ---------- */}
      <Panel title="何が売れたか（品目別）">
        {drill.items.length === 0 ? (
          <Empty>この月の売上がありません</Empty>
        ) : (
          <>
            <ol className="space-y-3">
              {drill.items.map((r, i) => {
                const on = selected?.key === r.key;
                return (
                  <li key={r.key}>
                    <Link
                      href={on ? base : `${base}&item=${encodeURIComponent(r.key)}#list`}
                      className={`block rounded-lg px-2 py-1.5 ${on ? "bg-(--color-bg) ring-1 ring-(--color-gold)" : "hover:bg-(--color-bg)"}`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={`min-w-0 truncate text-sm ${r.name === NO_NAME ? "text-(--color-dim)" : "font-semibold"}`}>
                          <span className="mr-1.5 text-xs tabular-nums text-(--color-dim)">{i + 1}</span>
                          {r.name}
                          {r.type && r.type !== r.name && <span className="ml-1.5 text-xs font-normal text-(--color-dim)">{r.type}</span>}
                        </span>
                        <span className="shrink-0 tabular-nums text-sm font-bold">{yen(r.amount)}円</span>
                      </div>
                      <div className="mt-1">
                        <Bar value={r.amount} max={itemMax} dim={r.name === NO_NAME} />
                      </div>
                      <p className="mt-0.5 text-xs text-(--color-dim)">
                        {r.qty}点・{r.count}件・{drill.total ? Math.round((r.amount / drill.total) * 100) : 0}%
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ol>
            {drill.unnamed > 0 && (
              <p className="mt-3 text-xs text-(--color-dim)">
                「{NO_NAME}」{drill.unnamed}件は、品目が記録されていない売上です（Squareの店頭決済は、翌朝までに注文明細から品目を自動で補います）。
              </p>
            )}
          </>
        )}
      </Panel>

      {/* ---------- 日別 ---------- */}
      <Panel title="日別の売上">
        <div className="flex h-24 items-end gap-px">
          {drill.daily.map((d) => (
            <div
              key={d.date}
              className={`flex-1 rounded-t ${d.amount ? "bg-(--color-gold)" : "bg-(--color-line)"}`}
              style={{ height: `${d.amount ? Math.max(4, Math.round((Math.abs(d.amount) / dayMax) * 100)) : 2}%`, opacity: d.amount < 0 ? 0.4 : 1 }}
              title={`${md(d.date)}（${wd(d.date)}）${yen(d.amount)}円`}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-(--color-dim)">
          <span>1日</span>
          <span>15日</span>
          <span>{drill.daily.length}日</span>
        </div>
      </Panel>

      {/* ---------- 区分 ---------- */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {drill.types.length > 0 && (
          <Panel title="種類別">
            <MiniTable rows={drill.types} total={drill.total} />
          </Panel>
        )}
        <Panel title="会員区分別">
          <MiniTable rows={drill.memberKinds} total={drill.total} />
        </Panel>
        <Panel title="支払方法別">
          <MiniTable rows={drill.pays} total={drill.total} />
        </Panel>
        {drill.pros.length > 0 && (
          <Panel title="担当別">
            <MiniTable rows={drill.pros} total={drill.total} />
          </Panel>
        )}
      </div>

      {/* ---------- 取引一覧 ---------- */}
      <div id="list">
        <Panel title={selected ? `取引一覧 — ${selected.name}` : "取引一覧"}>
          {selected && (
            <p className="mb-2 text-xs">
              <Badge tone="gold">{selected.name}</Badge>
              <Link href={base} className="ml-2 text-(--color-dim) underline">絞り込みを外す</Link>
            </p>
          )}
          {list.length === 0 ? (
            <Empty>取引がありません</Empty>
          ) : (
            <ul className="divide-y divide-(--color-line)">
              {list.slice(0, LIST_MAX).map((f) => (
                <li key={f.id} className="py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <span className="mr-2 text-xs tabular-nums text-(--color-dim)">{md(f.date)}（{wd(f.date)}）</span>
                      {f.items.map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join("・")}
                    </span>
                    <span className={`shrink-0 tabular-nums ${f.amount < 0 ? "text-rose-400" : ""}`}>{yen(f.amount)}円</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-(--color-dim)">
                    {[f.customer, f.memberKind, f.pay, f.pro && `担当 ${f.pro}`, f.maker].filter(Boolean).join("・") || "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {list.length > LIST_MAX && (
            <p className="mt-2 text-xs text-(--color-dim)">新しい順に{LIST_MAX}件まで表示しています（全{list.length}件）。</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
