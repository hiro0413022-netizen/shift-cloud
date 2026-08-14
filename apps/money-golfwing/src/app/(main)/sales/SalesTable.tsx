"use client";

import { useMemo, useState, useTransition } from "react";
import { inputCls, btnCls, btnGhostCls, yen } from "@/components/ui";
import { updateSale, deleteSaleById } from "./actions";
import CustomerHistoryDialog from "./CustomerHistoryDialog";
import { matchesQuery, optionCounts, summarize, BLANK_LABEL } from "@/lib/table-filter";

/** 一覧・編集用の1明細（サーバーで整形して渡す） */
export type SaleRow = {
  id: string;
  /** app=アプリ入力(mon_sales・編集可) / ledger=売上台帳の取込明細(mon_sales_lines・閲覧のみ) */
  source: "app" | "ledger";
  soldOn: string;
  category: string;
  customerName: string;
  memberKind: string;
  /** 種類（Excel E列） */
  itemType: string;
  /** メーカー名（Excel F列） */
  maker: string;
  /** 販売者（Excel Q列） */
  seller: string;
  /** 定価（税抜・1個あたり） */
  listPrice: number | null;
  /** 割引額（値引きはマイナス） */
  discount: number | null;
  amount: number;
  /** 決済金額（税込） */
  taxIncluded: number | null;
  payMethod: string;
  memo: string;
  productName: string;
  qty: number | null;
  pro: string;
  invItemId: string | null;
};

type Form = {
  soldOn: string; category: string; customerName: string; memberKind: string;
  itemType: string; maker: string; seller: string;
  listPrice: string; discount: string; unitPrice: string;
  amount: string; taxIncluded: string; payMethod: string; productName: string;
  qty: string; pro: string; memo: string;
};

function num(s: string): number {
  const n = Number(String(s).replace(/[",，\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toForm(r: SaleRow): Form {
  const qty = r.qty && r.qty > 0 ? r.qty : 1;
  const unit = r.amount ? Math.round(Number(r.amount) / qty) : 0;
  return {
    soldOn: r.soldOn, category: r.category, customerName: r.customerName, memberKind: r.memberKind,
    itemType: r.itemType, maker: r.maker, seller: r.seller,
    // 定価が未記録の古い明細は「売価＝定価・割引なし」として開く（保存しても金額は変わらない）
    listPrice: String(r.listPrice ?? unit ?? ""),
    discount: r.discount != null ? String(r.discount) : "",
    unitPrice: unit ? String(unit) : "",
    amount: String(r.amount || ""), taxIncluded: r.taxIncluded != null ? String(r.taxIncluded) : "",
    payMethod: r.payMethod, productName: r.productName, qty: String(qty),
    pro: r.pro, memo: r.memo,
  };
}

/**
 * 定価+割引額→売価→金額→決済金額 を積み直す。
 * どの欄を直したかで再計算の開始点を変える（売価を直接直したら定価・割引額は触らない）。
 */
/** ソート対象の列。ラベルは見出しに出す文言と同じ */
type SortKey = "soldOn" | "category" | "customerName" | "productName" | "pro" | "amount" | "payMethod";

/**
 * 明細のソート比較。文字列は日本語ロケールで比較（濁点・カナの並びを自然に）。
 * 同値のときは日付降順→金額降順で安定させる（毎回同じ並びになる）。
 */
function compareRows(a: SaleRow, b: SaleRow, key: SortKey, amountOf: (r: SaleRow) => number): number {
  let c = 0;
  if (key === "amount") {
    c = amountOf(a) - amountOf(b);
  } else if (key === "soldOn") {
    c = a.soldOn.localeCompare(b.soldOn);
  } else {
    c = String(a[key] ?? "").localeCompare(String(b[key] ?? ""), "ja");
  }
  if (c !== 0) return c;
  return b.soldOn.localeCompare(a.soldOn) || (b.amount - a.amount);
}

function recalcFrom(f: Form, p: Partial<Form>, start: "price" | "unit" | "amount"): Form {
  const next = { ...f, ...p };
  if (start === "price") {
    const unit = num(next.listPrice) + num(next.discount);
    next.unitPrice = unit ? String(Math.round(unit)) : "";
  }
  if (start === "price" || start === "unit") {
    const total = num(next.unitPrice) * num(next.qty);
    next.amount = total ? String(Math.round(total)) : "";
  }
  const amount = num(next.amount);
  next.taxIncluded = amount ? String(Math.floor(amount * 1.1)) : "";
  return next;
}

/** 絞り込みの対象列。Excelのオートフィルタと同じ考え方で「列＝1つの条件」にする */
type FilterKey = "category" | "productName" | "customerName" | "pro" | "payMethod" | "memberKind" | "maker";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "category", label: "区分" },
  { key: "productName", label: "品名" },
  { key: "customerName", label: "お客様" },
  { key: "pro", label: "担当" },
  { key: "maker", label: "メーカー" },
  { key: "payMethod", label: "支払" },
  { key: "memberKind", label: "会員区分" },
];

/** 集計（ピボット）の切り口 */
const PIVOTS: Array<{ key: FilterKey; label: string }> = [
  { key: "productName", label: "商品別" },
  { key: "customerName", label: "お客様別" },
  { key: "pro", label: "担当別" },
  { key: "category", label: "区分別" },
  { key: "maker", label: "メーカー別" },
  { key: "payMethod", label: "支払別" },
];

export default function SalesTable({
  rows,
  categories,
  memberKinds,
  payMethods,
  pros,
}: {
  rows: SaleRow[];
  categories: string[];
  memberKinds: string[];
  payMethods: string[];
  pros: string[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // お客様名クリックで開く購入履歴（名前で引くので明細IDではなく名前を持つ）
  const [historyName, setHistoryName] = useState<string | null>(null);

  // ソート: 見出しクリックで昇順⇄降順。既定は日付の新しい順（サーバーの並びと同じ）
  const [sortKey, setSortKey] = useState<SortKey>("soldOn");
  const [sortDesc, setSortDesc] = useState(true);
  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDesc((d) => !d);
    } else {
      setSortKey(key);
      // 金額・日付は「大きい/新しい順」から、名前系は「あいうえお順」から始める
      setSortDesc(key === "amount" || key === "soldOn");
    }
  }
  // 検索と絞り込み（Excelのオートフィルタ相当）。URLに出さず画面内で完結させる＝打った瞬間に絞れる
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Partial<Record<FilterKey, string>>>({});
  const [pivotKey, setPivotKey] = useState<FilterKey | null>(null);

  // 表示金額の切り替え: 税抜(既定)⇄税込。金額列・合計・集計がまとめて切り替わる。
  // 税込欄が未記録の明細は税抜×1.1(切り捨て)で補完＝入力フォームの自動計算と同じ式
  const [showTax, setShowTax] = useState(false);
  const taxLabel = showTax ? "税込" : "税抜";
  const amountOf = useMemo(
    () => (r: SaleRow) => (showTax ? (r.taxIncluded ?? Math.floor(r.amount * 1.1)) : r.amount),
    [showTax],
  );

  const filteredRows = useMemo(() => {
    const entries = Object.entries(picked).filter(([, v]) => v) as Array<[FilterKey, string]>;
    return rows.filter((r) => {
      for (const [k, v] of entries) {
        const cur = String(r[k] ?? "").trim() || BLANK_LABEL;
        if (cur !== v) return false;
      }
      return matchesQuery(
        [r.soldOn, r.category, r.customerName, r.memberKind, r.productName, r.itemType, r.maker,
         r.seller, r.pro, r.payMethod, r.memo, r.amount],
        query,
      );
    });
  }, [rows, picked, query]);

  const sortedRows = useMemo(() => {
    const arr = [...filteredRows].sort((a, b) => compareRows(a, b, sortKey, amountOf));
    if (sortDesc) arr.reverse();
    return arr;
  }, [filteredRows, sortKey, sortDesc, amountOf]);

  /**
   * プルダウンの候補。
   * 「その列以外の条件を適用した結果」から作る＝すでに選んだ条件で候補が減り、
   * 選ぶと0件になる選択肢が出ない（Excelのフィルタと同じ挙動）。
   */
  const optionsFor = useMemo(() => {
    const cache = {} as Record<FilterKey, Array<{ value: string; count: number }>>;
    for (const f of FILTERS) {
      const others = Object.entries(picked).filter(([k, v]) => v && k !== f.key) as Array<[FilterKey, string]>;
      const base = rows.filter((r) => {
        for (const [k, v] of others) {
          const cur = String(r[k] ?? "").trim() || BLANK_LABEL;
          if (cur !== v) return false;
        }
        return true;
      });
      cache[f.key] = optionCounts(base, (r) => String(r[f.key] ?? "").trim() || BLANK_LABEL);
    }
    return cache;
  }, [rows, picked]);

  const pivotRows = useMemo(
    () => (pivotKey ? summarize(filteredRows, (r) => String(r[pivotKey] ?? ""), amountOf, (r) => r.qty ?? 1) : []),
    [filteredRows, pivotKey, amountOf],
  );

  const filteredTotal = filteredRows.reduce((a, r) => a + amountOf(r), 0);
  const filteredQty = filteredRows.reduce((a, r) => a + (r.qty ?? 1), 0);
  const activeCount = Object.values(picked).filter(Boolean).length + (query.trim() ? 1 : 0);
  function clearAll() { setPicked({}); setQuery(""); }

  /** ソート可能な見出しセル */
  function sortableTh(key: SortKey, label: string, className: string) {
    const active = key === sortKey;
    return (
      <th className={className}>
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className={`inline-flex items-center gap-1 font-medium hover:text-(--color-gold) ${active ? "text-(--color-gold)" : ""}`}
          title={`${label}で並び替え`}
        >
          {label}
          <span className="text-[10px]">{active ? (sortDesc ? "▼" : "▲") : "▽"}</span>
        </button>
      </th>
    );
  }

  function startEdit(r: SaleRow) {
    setEditingId(r.id);
    setForm(toForm(r));
    setError(null);
  }

  function save(r: SaleRow) {
    if (!form) return;
    if (num(form.amount) === 0) { setError("金額を入力してください"); return; }
    if (num(form.qty) < 1) { setError("個数を入力してください（1以上）"); return; }
    setError(null);
    startTransition(async () => {
      await updateSale({
        id: r.id,
        soldOn: form.soldOn,
        category: form.category,
        customerName: form.customerName || undefined,
        memberKind: form.memberKind || undefined,
        itemType: form.itemType || undefined,
        maker: form.maker || undefined,
        seller: form.seller || undefined,
        listPrice: form.listPrice ? num(form.listPrice) : null,
        discount: form.discount ? num(form.discount) : null,
        amount: num(form.amount),
        taxIncluded: form.taxIncluded ? num(form.taxIncluded) : null,
        payMethod: form.payMethod || undefined,
        productName: form.productName || undefined,
        invItemId: r.invItemId || undefined, // 在庫リンクは維持（個数変更は在庫に反映）
        qty: num(form.qty) || 1,
        pro: form.pro || undefined,
        memo: form.memo || undefined,
      });
      setEditingId(null);
      setForm(null);
    });
  }

  function remove(r: SaleRow) {
    if (!window.confirm(`この明細を削除しますか？\n${r.soldOn} ${r.productName || r.customerName || r.category} ${yen(r.amount)}円${r.invItemId ? "\n（在庫連動も取り消され、在庫が戻ります）" : ""}${r.payMethod === "現金" ? "\n（現金出納の自動連携行も削除されます）" : ""}`)) return;
    startTransition(async () => { await deleteSaleById(r.id); });
  }

  // 選択肢に無い値（過去データ・無効化したプロ等）も落とさず出す
  const opts = (base: string[], cur: string) => (cur && !base.includes(cur) ? [cur, ...base] : base);

  return (
    <div>
      {historyName && <CustomerHistoryDialog name={historyName} onClose={() => setHistoryName(null)} />}

      {/* 探す・絞る */}
      <div className="mb-3 space-y-2 rounded-xl border border-(--color-line) bg-(--color-bg) p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="検索（品名・お客様・担当・備考…／スペースでAND、-で除外）"
            aria-label="明細を検索"
            className={`${inputCls} min-w-64 flex-1`}
          />
          {activeCount > 0 && (
            <button type="button" onClick={clearAll} className={btnGhostCls}>絞り込みを解除</button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const opts = optionsFor[f.key] ?? [];
            if (opts.length === 0 && !picked[f.key]) return null;
            return (
              <select
                key={f.key}
                value={picked[f.key] ?? ""}
                onChange={(e) => setPicked((p) => ({ ...p, [f.key]: e.target.value }))}
                aria-label={`${f.label}で絞り込む`}
                className={`${inputCls} !w-auto max-w-52 ${picked[f.key] ? "border-(--color-gold) font-medium" : ""}`}
              >
                <option value="">{f.label}（すべて）</option>
                {opts.map((o) => (
                  <option key={o.value} value={o.value}>{o.value}（{o.count}）</option>
                ))}
              </select>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-medium">
            {filteredRows.length}件
            {filteredRows.length !== rows.length && <span className="text-(--color-dim)">／全{rows.length}件</span>}
          </span>
          <span className="tabular-nums">合計 <strong>{yen(filteredTotal)}</strong> 円（{taxLabel}）</span>
          <span
            className="inline-flex overflow-hidden rounded-lg border border-(--color-line) text-xs"
            title="金額列・合計・集計の表示を税抜⇄税込で切り替えます（税込欄が未記録の明細は税抜×1.1で補完）"
          >
            <button
              type="button"
              onClick={() => setShowTax(false)}
              className={`px-2.5 py-1 ${!showTax ? "bg-(--color-gold) font-medium text-white" : "text-(--color-dim) hover:text-(--color-gold)"}`}
            >税抜</button>
            <button
              type="button"
              onClick={() => setShowTax(true)}
              className={`px-2.5 py-1 ${showTax ? "bg-(--color-gold) font-medium text-white" : "text-(--color-dim) hover:text-(--color-gold)"}`}
            >税込</button>
          </span>
          <span className="text-(--color-dim) tabular-nums">個数 {filteredQty}</span>
          <span className="ml-auto flex flex-wrap items-center gap-1">
            <span className="text-xs text-(--color-dim)">集計:</span>
            {PIVOTS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPivotKey((cur) => (cur === p.key ? null : p.key))}
                className={
                  pivotKey === p.key
                    ? "rounded-lg bg-(--color-gold) px-2.5 py-1 text-xs font-medium text-white"
                    : `${btnGhostCls} !px-2.5 !py-1 !text-xs`
                }
              >
                {p.label}
              </button>
            ))}
          </span>
        </div>
      </div>

      {/* 集計表（Excelのピボット相当）。行を押すとその値で明細を絞る */}
      {pivotKey && (
        <div className="mb-3 overflow-x-auto rounded-xl border border-(--color-line)">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-line) bg-(--color-bg) text-xs text-(--color-dim)">
                <th className="px-3 py-2 text-left">{PIVOTS.find((p) => p.key === pivotKey)?.label}</th>
                <th className="px-3 py-2 text-right">件数</th>
                <th className="px-3 py-2 text-right">個数</th>
                <th className="px-3 py-2 text-right">金額（{taxLabel}）</th>
                <th className="px-3 py-2 text-right">構成比</th>
              </tr>
            </thead>
            <tbody>
              {pivotRows.map((s) => (
                <tr key={s.key} className="border-b border-(--color-line) last:border-0">
                  <td className="px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => setPicked((p) => ({ ...p, [pivotKey]: p[pivotKey] === s.key ? "" : s.key }))}
                      className={`underline decoration-dotted underline-offset-2 hover:text-(--color-gold) ${picked[pivotKey] === s.key ? "font-bold text-(--color-gold)" : ""}`}
                      title="この行だけに絞り込む"
                    >{s.key}</button>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-(--color-dim)">{s.count}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-(--color-dim)">{s.qty}</td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">{yen(s.amount)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-(--color-dim)">
                    {filteredTotal ? `${Math.round((s.amount / filteredTotal) * 100)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sortedRows.length === 0 && (
        <p className="mb-3 rounded-lg bg-(--color-bg) px-3 py-4 text-center text-sm text-(--color-dim)">
          この条件に合う明細はありません。「絞り込みを解除」で戻せます
        </p>
      )}

      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-(--color-line) text-xs text-(--color-dim)">
            {sortableTh("soldOn", "日付", "py-2 pr-2 text-left")}
            {sortableTh("category", "区分", "px-2 py-2 text-left")}
            {sortableTh("customerName", "お客様名", "px-2 py-2 text-left")}
            {sortableTh("productName", "品名・内容", "px-2 py-2 text-left")}
            {sortableTh("pro", "担当", "px-2 py-2 text-left")}
            {sortableTh("amount", `金額(${taxLabel})`, "px-2 py-2 text-right")}
            {sortableTh("payMethod", "支払", "px-2 py-2 text-left")}
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((r) => (
            editingId === r.id && form ? (
              <tr key={r.id} className="border-b border-(--color-line) bg-(--color-bg)">
                <td colSpan={8} className="p-2">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                    <input type="date" value={form.soldOn} onChange={(e) => setForm({ ...form, soldOn: e.target.value })} className={inputCls} />
                    <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
                      {opts(categories, form.category).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} placeholder="お客様名" className={inputCls} />
                    <select value={form.memberKind} onChange={(e) => setForm({ ...form, memberKind: e.target.value })} className={inputCls}>
                      <option value="">会員区分</option>
                      {opts(memberKinds, form.memberKind).map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                    <select value={form.payMethod} onChange={(e) => setForm({ ...form, payMethod: e.target.value })} className={inputCls}>
                      <option value="">支払方法</option>
                      {opts(payMethods, form.payMethod).map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select value={form.pro} onChange={(e) => setForm({ ...form, pro: e.target.value })} className={inputCls}>
                      <option value="">担当プロ</option>
                      {opts(pros, form.pro).map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} placeholder="品名・内容" className={`${inputCls} sm:col-span-2`} />
                    <input value={form.itemType} onChange={(e) => setForm({ ...form, itemType: e.target.value })} placeholder="種類" aria-label="種類（ボール・グリップ・打席利用など）" className={inputCls} />
                    <input value={form.maker} onChange={(e) => setForm({ ...form, maker: e.target.value })} placeholder="メーカー名" aria-label="メーカー名" className={inputCls} />
                    <input value={form.seller} onChange={(e) => setForm({ ...form, seller: e.target.value })} placeholder="販売者" aria-label="販売者" className={inputCls} />
                    <input inputMode="numeric" value={form.listPrice} onChange={(e) => setForm(recalcFrom(form, { listPrice: e.target.value }, "price"))} placeholder="定価(税抜)" aria-label="定価（税抜）" className={inputCls} />
                    <input inputMode="numeric" value={form.discount} onChange={(e) => setForm(recalcFrom(form, { discount: e.target.value }, "price"))} placeholder="割引額(-)" aria-label="割引額（値引きはマイナス）" className={inputCls} />
                    <input inputMode="numeric" value={form.unitPrice} onChange={(e) => setForm(recalcFrom(form, { unitPrice: e.target.value }, "unit"))} placeholder="売価(自動)" aria-label="売価（税抜・自動）" className={inputCls} />
                    <input type="number" min={1} step={1} required value={form.qty} onChange={(e) => setForm(recalcFrom(form, { qty: e.target.value }, "unit"))} placeholder="個数(必須)" aria-label="個数（必須）" className={inputCls} />
                    <input inputMode="numeric" value={form.amount} onChange={(e) => setForm(recalcFrom(form, { amount: e.target.value }, "amount"))} placeholder="金額(税抜・自動)" aria-label="金額（税抜・自動）" className={inputCls} />
                    <input inputMode="numeric" value={form.taxIncluded} onChange={(e) => setForm({ ...form, taxIncluded: e.target.value })} placeholder="決済金額(税込)" aria-label="決済金額（税込）" className={inputCls} />
                    <input value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="備考" className={`${inputCls} sm:col-span-4`} />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button type="button" onClick={() => save(r)} disabled={pending} className={btnCls}>{pending ? "..." : "保存"}</button>
                    <button type="button" onClick={() => { setEditingId(null); setForm(null); setError(null); }} className={btnGhostCls}>キャンセル</button>
                    <span className="text-xs text-(--color-dim)">
                      定価＋割引額＝売価、売価×個数＝金額、決済金額は税込で自動計算されます。
                      {r.invItemId ? "在庫連動あり: 個数・日付の変更は在庫にも反映されます。" : ""}
                      現金の場合は現金出納の連携行と残高も自動で直ります
                    </span>
                  </div>
                  {error && <p className="mt-1 text-xs text-(--color-accent)">{error}</p>}
                </td>
              </tr>
            ) : (
              <tr key={r.id} className="border-b border-(--color-line)">
                <td className="py-2 pr-2 tabular-nums text-(--color-dim)">{r.soldOn}</td>
                <td className="px-2 py-2">{r.category}</td>
                <td className="px-2 py-2">
                  {r.customerName ? (
                    <button
                      type="button"
                      onClick={() => setHistoryName(r.customerName)}
                      className="underline decoration-dotted underline-offset-2 hover:text-(--color-gold)"
                      title="購入履歴を見る"
                    >{r.customerName}</button>
                  ) : (
                    <span className="text-(--color-dim)">—</span>
                  )}
                  {r.memberKind && <span className="ml-1 text-xs text-(--color-dim)">{r.memberKind}</span>}
                </td>
                <td className="px-2 py-2">
                  {r.productName || "—"}
                  {r.qty && r.qty > 1 ? <span className="ml-1 text-xs text-(--color-dim)">×{r.qty}</span> : null}
                  {r.invItemId && <span className="ml-1 text-xs text-(--color-gold)" title="在庫連動">◆</span>}
                  {(r.itemType || r.maker) && (
                    <span className="ml-1 text-xs text-(--color-dim)">{[r.itemType, r.maker].filter(Boolean).join(" / ")}</span>
                  )}
                </td>
                <td className="px-2 py-2 text-(--color-dim)">{r.pro || "—"}</td>
                <td
                  className="px-2 py-2 text-right tabular-nums"
                  title={showTax && r.taxIncluded == null ? "税込欄が未記録のため税抜×1.1で表示しています" : undefined}
                >
                  {yen(amountOf(r))}
                  {r.discount ? <span className="ml-1 text-xs text-(--color-accent)" title={`定価 ${yen(Number(r.listPrice ?? 0))} から値引き`}>{yen(Number(r.discount))}</span> : null}
                </td>
                <td className="px-2 py-2 text-(--color-dim)">{r.payMethod || "—"}</td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  {r.source === "ledger" ? (
                    <span className="text-xs text-(--color-dim)" title="売上台帳（Excel取込）の明細。修正はExcel再取込で">台帳</span>
                  ) : (
                    <>
                      <button type="button" onClick={() => startEdit(r)} className="mr-3 text-xs text-(--color-dim) hover:text-(--color-gold)">編集</button>
                      <button type="button" onClick={() => remove(r)} disabled={pending} className="text-xs text-(--color-dim) hover:text-(--color-accent)">削除</button>
                    </>
                  )}
                </td>
              </tr>
            )
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
