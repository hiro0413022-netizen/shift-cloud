"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { DIMS, defaultSort, type Dim, type SortKey } from "@/lib/pivot";
import { jstMonth, sortChoices, toQuery, type PivotParams } from "@/lib/pivot-params";
import { inputCls } from "@/components/ui";

/**
 * 集計表の条件パネル（#287・2026-09-28 ユーザー依頼「ココがもっと直観的にソートかけれるように」）
 *
 * 以前: プルダウン7つ＋「この条件で表示」ボタン。並べ替えは無かった。
 * いま: 全部ボタン（チップ）。押したらすぐ表が変わる（ボタンを押し直さなくてよい）。
 *   ・並び順 … 金額／件数／回数／1回あたり／名前（月・日なら日付）。同じボタンをもう一度押すと逆の順
 *   ・縦／横 … 何ごとに並べるか
 *   ・絞る   … 言葉（Enterで反映）と区分
 *   ・期間   … 今月／先月／3か月…、または自分で月を選ぶ
 * 表の見出し（page.tsx）を押しても同じように並べ替えられる。
 */

const ROW_DIMS: Dim[] = ["pro", "item", "type", "category", "customer", "memberKind", "pay", "month", "date"];
const COL_DIMS: (Dim | null)[] = [null, "month", "category", "pro", "memberKind", "pay", "type"];

const DIM_HINT: Partial<Record<Dim, string>> = {
  pro: "担当ごと",
  item: "商品ごと",
  customer: "お客様ごと",
  month: "月ごと",
  date: "日ごと",
};

type Props = {
  params: PivotParams;
  categories: string[];
  /** オーナーのみ店舗の切り替えを出す */
  canManageAll: boolean;
  storeName: string | null;
  /** いま表にある列（列の金額で並べているときの表示用） */
  colLabels: Record<string, string>;
};

export function PivotControls({ params: p, categories, canManageAll, storeName, colLabels }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(p.q);
  useEffect(() => setQ(p.q), [p.q]);

  const go = (over: Partial<PivotParams>) => {
    const next = { ...p, ...over };
    // 縦を変えたら、並び順はその項目のふつうの並びに戻す
    if (over.rows && over.rows !== p.rows && !over.sort) Object.assign(next, defaultSort(over.rows));
    start(() => router.push(`/analysis/table?${toQuery(next)}`, { scroll: false }));
  };

  const setSort = (key: SortKey) => {
    if (p.sort === key) return go({ dir: p.dir === "desc" ? "asc" : "desc" });
    // 名前・日付は「あいうえお順／古い順」から、数字は「多い順」から
    go({ sort: key, dir: key === "label" ? "asc" : "desc" });
  };

  const thisMonth = jstMonth(0);
  const periods = [
    { label: "今月", from: thisMonth, to: thisMonth },
    { label: "先月", from: jstMonth(-1), to: jstMonth(-1) },
    { label: "3か月", from: jstMonth(-2), to: thisMonth },
    { label: "半年", from: jstMonth(-5), to: thisMonth },
    { label: "1年", from: jstMonth(-11), to: thisMonth },
  ];
  const customPeriod = !periods.some((x) => x.from === p.from && x.to === p.to);
  const choices = sortChoices(p.rows);
  const colSort = p.sort.startsWith("col:") ? p.sort.slice(4) : null;

  return (
    <div className={`space-y-4 transition-opacity ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
      <Row label="並び順" hint="同じボタンをもう一度押すと逆になります">
        {choices.map((c) => {
          const on = p.sort === c.key;
          return (
            <Chip key={c.key} on={on} onClick={() => setSort(c.key)}>
              {c.label}
              {on ? (
                <span className="ml-1 font-bold">
                  {p.dir === "desc" ? "▼" : "▲"} {p.dir === "desc" ? c.desc : c.asc}
                </span>
              ) : (
                <span className="ml-1 text-(--color-dim)">{c.desc}</span>
              )}
            </Chip>
          );
        })}
        {colSort !== null && (
          <Chip on onClick={() => go({ dir: p.dir === "desc" ? "asc" : "desc" })}>
            「{colLabels[colSort] ?? colSort}」の金額
            <span className="ml-1 font-bold">{p.dir === "desc" ? "▼ 多い順" : "▲ 少ない順"}</span>
          </Chip>
        )}
      </Row>

      <Row label="縦に並べる" hint="1行ずつ何ごとに分けるか">
        {ROW_DIMS.map((d) => (
          <Chip key={d} on={p.rows === d} onClick={() => go({ rows: d, cols: p.cols === d ? null : p.cols })}>
            {DIM_HINT[d] ?? DIMS[d]}
          </Chip>
        ))}
      </Row>

      <Row label="横に並べる" hint="列に分けて見比べる（なし＝合計だけ）">
        {COL_DIMS.filter((d) => d !== p.rows).map((d) => (
          <Chip key={d ?? "none"} on={p.cols === d} onClick={() => go({ cols: d })}>
            {d === null ? "なし" : (DIM_HINT[d] ?? DIMS[d])}
          </Chip>
        ))}
      </Row>

      <Row label="言葉で絞る" hint="商品名・種類・区分に含むもの。空白で区切るとどれか">
        <form
          className="flex w-full max-w-md gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() });
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="例: パーソナル"
            className={`${inputCls} min-w-0 flex-1`}
            enterKeyHint="search"
            aria-label="言葉で絞る"
          />
          <button className="shrink-0 rounded-lg bg-(--color-gold) px-4 text-sm font-semibold text-white">絞る</button>
          {p.q && (
            <button type="button" onClick={() => go({ q: "" })} className="shrink-0 rounded-lg border border-(--color-line) px-3 text-sm">
              消す
            </button>
          )}
        </form>
      </Row>

      {(categories.length > 0 || p.cat) && (
        <Row label="区分">
          <Chip on={!p.cat} onClick={() => go({ cat: "" })}>すべて</Chip>
          {[...new Set([...categories, ...(p.cat ? [p.cat] : [])])].map((c) => (
            <Chip key={c} on={p.cat === c} onClick={() => go({ cat: p.cat === c ? "" : c })}>
              {c}
            </Chip>
          ))}
        </Row>
      )}

      <Row label="期間">
        {periods.map((x) => (
          <Chip key={x.label} on={p.from === x.from && p.to === x.to} onClick={() => go({ from: x.from, to: x.to })}>
            {x.label}
          </Chip>
        ))}
        <span className={`flex items-center gap-1 rounded-full border px-2 py-1 text-sm ${customPeriod ? "border-(--color-gold) bg-(--color-gold-soft)" : "border-(--color-line)"}`}>
          <input
            type="month"
            value={p.from}
            onChange={(e) => e.target.value && go({ from: e.target.value, to: e.target.value > p.to ? e.target.value : p.to })}
            className="bg-transparent px-1 py-0.5"
            aria-label="いつから"
          />
          〜
          <input
            type="month"
            value={p.to}
            onChange={(e) => e.target.value && go({ to: e.target.value, from: e.target.value < p.from ? e.target.value : p.from })}
            className="bg-transparent px-1 py-0.5"
            aria-label="いつまで"
          />
        </span>
      </Row>

      {canManageAll && (
        <Row label="店舗">
          <Chip on={p.scope === "all"} onClick={() => go({ scope: "all" })}>全店</Chip>
          <Chip on={p.scope === "store"} onClick={() => go({ scope: "store" })}>{storeName ?? "選んでいる店舗"}だけ</Chip>
        </Row>
      )}

      {pending && <p className="text-sm text-(--color-gold)">表を作り直しています…</p>}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="gap-3 md:flex">
      <div className="mb-1.5 shrink-0 md:mb-0 md:w-28 md:pt-2">
        <p className="text-sm font-semibold">{label}</p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">{children}</div>
        {hint && <p className="mt-1 text-xs text-(--color-dim)">{hint}</p>}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-10 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
        on ? "border-(--color-gold) bg-(--color-gold) text-white" : "border-(--color-line) bg-white hover:border-(--color-gold) hover:bg-(--color-gold-soft)"
      }`}
    >
      {children}
    </button>
  );
}

