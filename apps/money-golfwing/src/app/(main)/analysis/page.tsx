import Link from "next/link";
import { requireMoneyActor } from "@/lib/auth";
import { getCurrentStore } from "@/lib/money";
import { Panel, Empty, Badge, yen, btnGhostCls } from "@/components/ui";
import { segmentSales, categorySales, ledgerBreakdown, prevMonth } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/**
 * 売上分析（DECISIONS #58）
 * 「事業ごと」「カテゴリごと」に売上を見える化する。
 * 事業別は fin_entries（財務の正典）、カテゴリ・品目別は台帳（mon_sales / mon_sales_lines）。
 * 新しい集計ルールは作らない＝どの画面で見ても数字が一致する。
 */

function ym(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function nextMonth(m: string) {
  return prevMonth(m, -1);
}
function label(m: string) {
  const [y, mm] = m.split("-");
  return `${y}年${Number(mm)}月`;
}
function pct(cur: number, prev: number): { text: string; up: boolean } | null {
  if (!prev) return null;
  const d = ((cur - prev) / Math.abs(prev)) * 100;
  return { text: `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`, up: d >= 0 };
}

/** 依存ライブラリ無しの横棒。割合が一目で分かればよい */
function Bar({ value, max, tone = "gold" }: { value: number; max: number; tone?: "gold" | "accent" | "dim" }) {
  const w = max > 0 ? Math.max(1, Math.round((Math.abs(value) / max) * 100)) : 0;
  const bg = tone === "gold" ? "bg-(--color-gold)" : tone === "accent" ? "bg-(--color-accent)" : "bg-(--color-dim)";
  return (
    <div className="h-1.5 w-full rounded-full bg-(--color-bg)">
      <div className={`h-1.5 rounded-full ${bg}`} style={{ width: `${w}%`, opacity: value < 0 ? 0.4 : 1 }} />
    </div>
  );
}

function Delta({ cur, prev }: { cur: number; prev: number }) {
  const p = pct(cur, prev);
  if (!p) return <span className="text-xs text-(--color-dim)">前月なし</span>;
  return (
    <span className={`text-xs tabular-nums ${p.up ? "text-(--color-ok)" : "text-rose-400"}`}>
      {p.text} <span className="text-(--color-dim)">（前月 {yen(prev)}円）</span>
    </span>
  );
}

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const actor = await requireMoneyActor();
  const store = await getCurrentStore(actor);
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? (sp.month as string) : ym(new Date());

  // 事業別は全社の数字なので本部権限のみ。現場は自店舗のカテゴリ内訳を見る
  const [seg, cats, br] = await Promise.all([
    actor.canManageAll ? segmentSales(actor.companyId, month) : Promise.resolve(null),
    categorySales(actor.companyId, actor.canManageAll ? null : (store?.id ?? null), month),
    ledgerBreakdown(actor.companyId, actor.canManageAll ? null : (store?.id ?? null), month),
  ]);

  const catTotal = cats.reduce((a, c) => a + c.amount, 0);
  const catPrev = cats.reduce((a, c) => a + c.prev, 0);
  const catMax = Math.max(...cats.map((c) => Math.abs(c.amount)), 1);
  const trendMax = Math.max(...(seg?.trend ?? []).map((t) => t.amount), 1);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">売上分析 — {label(month)}</h1>
          <p className="text-sm text-(--color-dim)">
            {actor.canManageAll ? "事業別は財務(fin_entries)、カテゴリ・品目別は売上台帳から集計しています" : `${store?.name ?? "店舗未選択"} の売上内訳`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/analysis?month=${prevMonth(month)}`} className={btnGhostCls}>← 前月</Link>
          <Link href={`/analysis?month=${nextMonth(month)}`} className={btnGhostCls}>翌月 →</Link>
        </div>
      </header>

      {/* ---------- 事業別 ---------- */}
      {seg && (
        <>
          <Panel title={`事業別 売上（${label(month)}）`}>
            {seg.segments.length === 0 ? (
              <Empty>この月の売上データがありません</Empty>
            ) : (
              <>
                <div className="mb-4 flex items-baseline gap-3">
                  <p className="text-3xl font-bold tabular-nums">{yen(seg.total)}<span className="ml-1 text-base font-normal text-(--color-dim)">円</span></p>
                  <span className="text-xs text-(--color-dim)">全事業合計（税抜）</span>
                </div>
                <ul className="space-y-4">
                  {seg.segments.map((s) => (
                    <li key={s.segment}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold">{s.segment}</span>
                        <span className="tabular-nums text-sm font-bold">{yen(s.amount)}円</span>
                      </div>
                      <Bar value={s.amount} max={Math.max(...seg.segments.map((x) => x.amount), 1)} />
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Delta cur={s.amount} prev={s.prev} />
                        <span className="text-xs text-(--color-dim)">
                          / 全体の {seg.total ? Math.round((s.amount / seg.total) * 100) : 0}%
                        </span>
                      </div>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {s.categories.map((c) => (
                          <li key={c.name} className="rounded-lg border border-(--color-line) px-2 py-1 text-xs">
                            <span className="text-(--color-dim)">{c.name}</span>{" "}
                            <span className="tabular-nums">{yen(c.amount)}円</span>{" "}
                            {c.isForecast && <Badge tone="accent">予測</Badge>}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs text-(--color-dim)">
                  「予測」＝口座振替の月会費実績（ファイン）が届くまでの暫定値。実績を入力すると自動で置き換わります。
                </p>
              </>
            )}
          </Panel>

          <Panel title="全社 売上推移（直近12か月）">
            <div className="flex h-32 items-end gap-1">
              {seg.trend.map((t) => (
                <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t ${t.month === month ? "bg-(--color-gold)" : "bg-(--color-line)"}`}
                    style={{ height: `${Math.max(2, Math.round((t.amount / trendMax) * 100))}%` }}
                    title={`${t.month}: ${yen(t.amount)}円`}
                  />
                  <span className="text-[10px] text-(--color-dim)">{Number(t.month.slice(5))}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-(--color-dim)">
              最大 {yen(trendMax)}円 / 当月 {yen(seg.trend[seg.trend.length - 1]?.amount ?? 0)}円
            </p>
          </Panel>
        </>
      )}

      {/* ---------- カテゴリ別 ---------- */}
      <Panel title={`カテゴリ別 売上（店頭決済・${label(month)}）`}>
        {cats.length === 0 ? (
          <Empty>この月の店頭決済がありません。台帳の取込がまだかもしれません（npm run import:sales）</Empty>
        ) : (
          <>
            <div className="mb-3 flex items-baseline gap-3">
              <p className="text-2xl font-bold tabular-nums">{yen(catTotal)}<span className="ml-1 text-sm font-normal text-(--color-dim)">円</span></p>
              <Delta cur={catTotal} prev={catPrev} />
            </div>
            <ul className="space-y-3">
              {cats.map((c) => (
                <li key={c.name}>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span className="text-sm">{c.name}</span>
                    <span className="tabular-nums text-sm">
                      {yen(c.amount)}円
                      <span className="ml-2 text-xs text-(--color-dim)">{catTotal ? Math.round((c.amount / catTotal) * 100) : 0}%</span>
                    </span>
                  </div>
                  <Bar value={c.amount} max={catMax} tone={c.amount < 0 ? "dim" : "gold"} />
                  <div className="mt-1">
                    <Delta cur={c.amount} prev={c.prev} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-(--color-dim)">
              「月会費(窓口)」は窓口決済の会費・入会金です。口座振替の月会費は事業別の「月会費」に入ります。
            </p>
          </>
        )}
      </Panel>

      {/* ---------- 品目・支払方法の内訳 ---------- */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="物販の内訳（種類別）">
          {br.retail.length === 0 ? (
            <Empty>データなし</Empty>
          ) : (
            <ul className="space-y-2">
              {br.retail.slice(0, 8).map((r) => (
                <li key={r.name} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {yen(r.amount)}円 <span className="text-xs text-(--color-dim)">{r.count}点</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="利用料の内訳">
          {br.usage.length === 0 ? (
            <Empty>データなし</Empty>
          ) : (
            <ul className="space-y-2">
              {br.usage.slice(0, 8).map((r) => (
                <li key={r.name} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {yen(r.amount)}円 <span className="text-xs text-(--color-dim)">{r.count}件</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="支払方法別">
          {br.pay.length === 0 ? (
            <Empty>データなし</Empty>
          ) : (
            <ul className="space-y-2">
              {br.pay.map((r) => (
                <li key={r.name} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {yen(r.amount)}円 <span className="text-xs text-(--color-dim)">{r.count}件</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <p className="text-xs text-(--color-dim)">
        台帳明細 {br.lineCount} 件をもとに集計しています。数字が古いときは売上台帳の取込（npm run import:sales -- --month={month} --apply）を確認してください。
      </p>
    </div>
  );
}
