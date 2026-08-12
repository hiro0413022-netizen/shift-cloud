"use client";

import { useMemo, useState } from "react";
import { inputCls, btnGhostCls, yen } from "@/components/ui";
import { deleteCashEntry } from "./actions";
import { matchesQuery, optionCounts } from "@/lib/table-filter";

export type CashRow = {
  id: string; entry_date: string; summary: string | null; description: string | null;
  counterpart: string | null; in_amount: number; out_amount: number; balance: number | null; source: string;
};

type SortKey = "entry_date" | "summary" | "counterpart" | "in_amount" | "out_amount";
type Kind = "" | "in" | "out";

function compare(a: CashRow, b: CashRow, key: SortKey): number {
  let c = 0;
  if (key === "in_amount" || key === "out_amount") c = Number(a[key]) - Number(b[key]);
  else if (key === "entry_date") c = a.entry_date.localeCompare(b.entry_date);
  else c = String(a[key] ?? "").localeCompare(String(b[key] ?? ""), "ja");
  // 同値は日付→登録順で安定させる（毎回同じ並びになる）
  return c !== 0 ? c : a.entry_date.localeCompare(b.entry_date);
}

/** 現金出納の一覧。探す・絞る・並び替える（残高は行に記録済みの値をそのまま出す） */
export default function CashTable({ rows }: { rows: CashRow[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("");
  const [summary, setSummary] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("entry_date");
  const [sortDesc, setSortDesc] = useState(false); // 出納帳は古い順が既定（残高の流れが読める）

  const summaryOptions = useMemo(() => optionCounts(rows, (r) => r.summary), [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (kind === "in" && !Number(r.in_amount)) return false;
    if (kind === "out" && !Number(r.out_amount)) return false;
    if (summary && (r.summary ?? "") !== summary) return false;
    return matchesQuery(
      [r.entry_date, r.summary, r.description, r.counterpart, r.in_amount, r.out_amount],
      query,
    );
  }), [rows, query, kind, summary]);

  const sorted = useMemo(() => {
    const arr = [...filtered].sort((a, b) => compare(a, b, sortKey));
    if (sortDesc) arr.reverse();
    return arr;
  }, [filtered, sortKey, sortDesc]);

  const inTotal = filtered.reduce((a, r) => a + Number(r.in_amount || 0), 0);
  const outTotal = filtered.reduce((a, r) => a + Number(r.out_amount || 0), 0);
  const active = !!query.trim() || !!kind || !!summary;

  function toggle(key: SortKey) {
    if (key === sortKey) setSortDesc((d) => !d);
    else { setSortKey(key); setSortDesc(key === "in_amount" || key === "out_amount"); }
  }
  function th(key: SortKey, label: string, cls: string) {
    const on = key === sortKey;
    return (
      <th className={cls}>
        <button type="button" onClick={() => toggle(key)}
          className={`inline-flex items-center gap-1 font-medium hover:text-(--color-gold) ${on ? "text-(--color-gold)" : ""}`}
          title={`${label}で並び替え`}>
          {label}<span className="text-[10px]">{on ? (sortDesc ? "▼" : "▲") : "▽"}</span>
        </button>
      </th>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-(--color-line) bg-(--color-bg) p-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="出納を検索"
          placeholder="検索（摘要・内容・相手…）" className={`${inputCls} min-w-56 flex-1`} />
        <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="入金・出金で絞り込む"
          className={`${inputCls} !w-auto ${kind ? "border-(--color-gold) font-medium" : ""}`}>
          <option value="">入金・出金（すべて）</option>
          <option value="in">入金のみ</option>
          <option value="out">出金のみ</option>
        </select>
        {summaryOptions.length > 0 && (
          <select value={summary} onChange={(e) => setSummary(e.target.value)} aria-label="摘要で絞り込む"
            className={`${inputCls} !w-auto max-w-52 ${summary ? "border-(--color-gold) font-medium" : ""}`}>
            <option value="">摘要（すべて）</option>
            {summaryOptions.map((o) => <option key={o.value} value={o.value}>{o.value}（{o.count}）</option>)}
          </select>
        )}
        {active && (
          <button type="button" onClick={() => { setQuery(""); setKind(""); setSummary(""); }} className={btnGhostCls}>
            絞り込みを解除
          </button>
        )}
        <span className="w-full text-sm sm:w-auto">
          <span className="font-medium">{filtered.length}件</span>
          {filtered.length !== rows.length && <span className="text-(--color-dim)">／全{rows.length}件</span>}
          <span className="ml-3 tabular-nums text-(--color-ok)">入金 {yen(inTotal)}</span>
          <span className="ml-2 tabular-nums">出金 {yen(outTotal)}</span>
        </span>
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-lg bg-(--color-bg) px-3 py-4 text-center text-sm text-(--color-dim)">
          この条件に合う記録はありません
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-line) text-xs text-(--color-dim)">
                {th("entry_date", "日付", "py-2 pr-2 text-left")}
                {th("summary", "摘要 / 内容", "px-2 py-2 text-left")}
                {th("counterpart", "相手", "px-2 py-2 text-left")}
                {th("in_amount", "入金", "px-2 py-2 text-right")}
                {th("out_amount", "出金", "px-2 py-2 text-right")}
                <th className="px-2 py-2 text-right font-medium">残高</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-b border-(--color-line)">
                  <td className="py-2 pr-2 tabular-nums text-(--color-dim)">{r.entry_date}</td>
                  <td className="px-2 py-2">
                    {r.summary ?? "—"}{r.description ? ` / ${r.description}` : ""}
                    {r.source === "sales" && <span className="ml-1 text-xs text-(--color-gold)">売上</span>}
                  </td>
                  <td className="px-2 py-2 text-(--color-dim)">{r.counterpart || "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-(--color-ok)">{r.in_amount ? yen(Number(r.in_amount)) : ""}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.out_amount ? yen(Number(r.out_amount)) : ""}</td>
                  <td className="px-2 py-2 text-right font-medium tabular-nums">{r.balance == null ? "—" : yen(Number(r.balance))}</td>
                  <td className="px-2 py-2 text-right">
                    <form action={deleteCashEntry}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-xs text-(--color-dim) hover:text-(--color-accent)">削除</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-(--color-dim)">
            残高はその行を記録したときの残高です。並び替えても再計算はしません
          </p>
        </div>
      )}
    </div>
  );
}
