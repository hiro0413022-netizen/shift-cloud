"use client";

import { useState, useTransition } from "react";
import { inputCls, btnCls, btnGhostCls, yen } from "@/components/ui";
import { updateSale, deleteSaleById } from "./actions";
import CustomerHistoryDialog from "./CustomerHistoryDialog";

/** 一覧・編集用の1明細（サーバーで整形して渡す） */
export type SaleRow = {
  id: string;
  soldOn: string;
  category: string;
  customerName: string;
  memberKind: string;
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
    <div className="overflow-x-auto">
      {historyName && <CustomerHistoryDialog name={historyName} onClose={() => setHistoryName(null)} />}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-(--color-line) text-xs text-(--color-dim)">
            <th className="py-2 pr-2 text-left font-medium">日付</th>
            <th className="px-2 py-2 text-left font-medium">区分</th>
            <th className="px-2 py-2 text-left font-medium">お客様名</th>
            <th className="px-2 py-2 text-left font-medium">品名・内容</th>
            <th className="px-2 py-2 text-left font-medium">担当</th>
            <th className="px-2 py-2 text-right font-medium">金額</th>
            <th className="px-2 py-2 text-left font-medium">支払</th>
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
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
                </td>
                <td className="px-2 py-2 text-(--color-dim)">{r.pro || "—"}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {yen(Number(r.amount))}
                  {r.discount ? <span className="ml-1 text-xs text-(--color-accent)" title={`定価 ${yen(Number(r.listPrice ?? 0))} から値引き`}>{yen(Number(r.discount))}</span> : null}
                </td>
                <td className="px-2 py-2 text-(--color-dim)">{r.payMethod || "—"}</td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <button type="button" onClick={() => startEdit(r)} className="mr-3 text-xs text-(--color-dim) hover:text-(--color-gold)">編集</button>
                  <button type="button" onClick={() => remove(r)} disabled={pending} className="text-xs text-(--color-dim) hover:text-(--color-accent)">削除</button>
                </td>
              </tr>
            )
          ))}
        </tbody>
      </table>
    </div>
  );
}
