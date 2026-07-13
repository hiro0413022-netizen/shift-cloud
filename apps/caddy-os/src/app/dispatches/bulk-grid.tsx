"use client";

import { useState, useRef } from "react";
import { saveDispatchesBulk } from "../actions";
import { btnCls } from "@/components/ui";

type Client = { id: string; name: string; unit_price: number | null };
type Partner = { id: string; name: string; default_fee: number | null; default_transport: number };
type Staff = { id: string; name: string };

type Row = {
  date: string;
  clientId: string;
  sales: string;
  assignee: string; // "p:<id>" | "s:<id>" | ""
  fee: string;
  transport: string;
  special: string;
  memo: string;
};

const emptyRow = (date: string): Row => ({
  date,
  clientId: "",
  sales: "",
  assignee: "",
  fee: "",
  transport: "",
  special: "",
  memo: "",
});

/**
 * スプレッドシート風の一括入力。
 * - Enter で下に行を追加（連続入力）
 * - 取引先を選ぶと単価、委託先を選ぶと委託料・交通費が自動で入る
 * - 直前の行の「日付・取引先」を引き継ぐので、同じ日の複数キャディが速い
 * - 自社スタッフを選んだ行は委託料・手当を封鎖（給与との二重計上防止 / #44）
 */
export function BulkGrid({
  clients,
  partners,
  staff,
  defaultDate,
}: {
  clients: Client[];
  partners: Partner[];
  staff: Staff[];
  defaultDate: string;
}) {
  const [rows, setRows] = useState<Row[]>([emptyRow(defaultDate), emptyRow(defaultDate), emptyRow(defaultDate)]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const update = (i: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const addRow = (i: number) => {
    setRows((prev) => {
      const base = prev[i];
      const next = [...prev];
      // 日付と取引先を引き継ぐ（同じ日・同じコースに複数キャディを入れる運用が多いため）
      next.splice(i + 1, 0, {
        ...emptyRow(base.date),
        clientId: base.clientId,
        sales: base.sales,
      });
      return next;
    });
  };

  const removeRow = (i: number) => {
    setRows((prev) => (prev.length <= 1 ? [emptyRow(defaultDate)] : prev.filter((_, idx) => idx !== i)));
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addRow(i);
      // 追加した行の最初の入力へフォーカス
      requestAnimationFrame(() => {
        const inputs = gridRef.current?.querySelectorAll<HTMLElement>("[data-row-start]");
        inputs?.[i + 1]?.focus();
      });
    }
  };

  const filled = rows.filter((r) => r.date && r.assignee);

  const submit = async () => {
    setError(null);
    setSaved(null);
    if (filled.length === 0) {
      setError("担当キャディが未選択の行しかありません");
      return;
    }
    setSaving(true);
    const res = await saveDispatchesBulk(
      filled.map((r) => ({
        dispatch_date: r.date,
        client_id: r.clientId || null,
        sales_amount: Number(r.sales || 0),
        assignee: r.assignee,
        fee_amount: Number(r.fee || 0),
        transport_amount: Number(r.transport || 0),
        special_amount: Number(r.special || 0),
        memo: r.memo || null,
      }))
    );
    setSaving(false);
    if (res.error) setError(res.error);
    else {
      setSaved(res.count ?? filled.length);
      setRows([emptyRow(defaultDate), emptyRow(defaultDate), emptyRow(defaultDate)]);
    }
  };

  const cell = "w-full rounded border border-(--color-line) bg-white px-2 py-1 text-sm outline-none focus:border-(--color-accent)";

  return (
    <div ref={gridRef}>
      <div className="mb-2 flex items-center gap-3 text-xs text-(--color-dim)">
        <span>
          <kbd className="rounded border px-1">Enter</kbd> で次の行（日付・取引先を引き継ぎます）
        </span>
        <span>取引先を選ぶと単価、委託先を選ぶと委託料が自動で入ります</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs text-(--color-dim)">
            <tr>
              <th className="w-32 pb-1">派遣日</th>
              <th className="w-48 pb-1">取引先</th>
              <th className="w-24 pb-1">売上</th>
              <th className="w-48 pb-1">担当キャディ</th>
              <th className="w-24 pb-1">委託料</th>
              <th className="w-24 pb-1">交通費</th>
              <th className="w-24 pb-1">手当</th>
              <th className="pb-1">メモ</th>
              <th className="w-8 pb-1"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isStaff = r.assignee.startsWith("s:");
              return (
                <tr key={i}>
                  <td className="py-0.5 pr-1">
                    <input
                      type="date"
                      value={r.date}
                      data-row-start
                      onChange={(e) => update(i, { date: e.target.value })}
                      onKeyDown={(e) => onKeyDown(e, i)}
                      className={cell}
                    />
                  </td>
                  <td className="py-0.5 pr-1">
                    <select
                      value={r.clientId}
                      onChange={(e) => {
                        const c = clients.find((x) => x.id === e.target.value);
                        update(i, {
                          clientId: e.target.value,
                          sales: c?.unit_price ? String(c.unit_price) : e.target.value ? r.sales : "0",
                        });
                      }}
                      onKeyDown={(e) => onKeyDown(e, i)}
                      className={cell}
                    >
                      <option value="">（売上なし）</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-0.5 pr-1">
                    <input
                      type="number"
                      value={r.sales}
                      onChange={(e) => update(i, { sales: e.target.value })}
                      onKeyDown={(e) => onKeyDown(e, i)}
                      className={`${cell} text-right tabular-nums`}
                      placeholder="0"
                    />
                  </td>
                  <td className="py-0.5 pr-1">
                    <select
                      value={r.assignee}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v.startsWith("p:")) {
                          const p = partners.find((x) => `p:${x.id}` === v);
                          update(i, {
                            assignee: v,
                            fee: p?.default_fee ? String(p.default_fee) : "",
                            transport: p?.default_transport ? String(p.default_transport) : "",
                          });
                        } else {
                          update(i, { assignee: v, fee: "", special: "" });
                        }
                      }}
                      onKeyDown={(e) => onKeyDown(e, i)}
                      className={cell}
                    >
                      <option value="">選択</option>
                      <optgroup label="委託先（外注）">
                        {partners.map((p) => (
                          <option key={p.id} value={`p:${p.id}`}>
                            {p.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="自社スタッフ">
                        {staff.map((s) => (
                          <option key={s.id} value={`s:${s.id}`}>
                            {s.name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </td>
                  <td className="py-0.5 pr-1">
                    <input
                      type="number"
                      value={isStaff ? "" : r.fee}
                      disabled={isStaff}
                      onChange={(e) => update(i, { fee: e.target.value })}
                      onKeyDown={(e) => onKeyDown(e, i)}
                      className={`${cell} text-right tabular-nums disabled:bg-slate-100`}
                      placeholder={isStaff ? "給与" : "0"}
                    />
                  </td>
                  <td className="py-0.5 pr-1">
                    <input
                      type="number"
                      value={r.transport}
                      onChange={(e) => update(i, { transport: e.target.value })}
                      onKeyDown={(e) => onKeyDown(e, i)}
                      className={`${cell} text-right tabular-nums`}
                      placeholder="0"
                    />
                  </td>
                  <td className="py-0.5 pr-1">
                    <input
                      type="number"
                      value={isStaff ? "" : r.special}
                      disabled={isStaff}
                      onChange={(e) => update(i, { special: e.target.value })}
                      onKeyDown={(e) => onKeyDown(e, i)}
                      className={`${cell} text-right tabular-nums disabled:bg-slate-100`}
                      placeholder={isStaff ? "—" : "0"}
                    />
                  </td>
                  <td className="py-0.5 pr-1">
                    <input
                      type="text"
                      value={r.memo}
                      onChange={(e) => update(i, { memo: e.target.value })}
                      onKeyDown={(e) => onKeyDown(e, i)}
                      className={cell}
                    />
                  </td>
                  <td className="py-0.5 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="text-xs text-(--color-dim) hover:text-red-600"
                      title="この行を削除"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => addRow(rows.length - 1)} className="rounded-lg border border-(--color-line) px-3 py-1.5 text-sm">
          ＋ 行を追加
        </button>
        <button type="button" onClick={submit} disabled={saving || filled.length === 0} className={btnCls}>
          {saving ? "登録中…" : `${filled.length}件をまとめて登録`}
        </button>
        {saved !== null ? <span className="text-sm text-emerald-700">{saved}件を登録しました</span> : null}
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}
