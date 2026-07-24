"use client";

import { useState } from "react";
import { saveGolfwingBulk } from "../actions";
import { btnCls } from "@/components/ui";

type Partner = { id: string; name: string; hourly_wage: number | null };

type Row = { partnerId: string; date: string; hours: string; wage: string; memo: string };

const emptyRow = (date: string): Row => ({ partnerId: "", date, hours: "", wage: "", memo: "" });

/**
 * ゴルフウィング勤務の入力（#62 ⑤）。
 * キャディが自社のゴルフウィングに出勤した分を「日付 × 時間 × 時給」で記録する。
 * ゴルフウィングへの請求書は作らず、キャディ→YOZAN請求書に合算される。
 * 委託料として財務のキャディ事業 外注費に集計される（ユーザー決定）。
 */
export function GolfwingGrid({ partners, defaultDate }: { partners: Partner[]; defaultDate: string }) {
  const [rows, setRows] = useState<Row[]>([emptyRow(defaultDate), emptyRow(defaultDate)]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const filled = rows.filter((r) => r.partnerId && r.date && Number(r.hours) > 0);

  const submit = async () => {
    setError(null);
    setSaved(null);
    if (filled.length === 0) {
      setError("キャディ・日付・時間が入った行がありません");
      return;
    }
    setSaving(true);
    const res = await saveGolfwingBulk(
      filled.map((r) => ({
        partner_id: r.partnerId,
        work_date: r.date,
        hours: Number(r.hours),
        hourly_wage: Number(r.wage || 0),
        memo: r.memo || null,
      }))
    );
    setSaving(false);
    if (res.error) setError(res.error);
    else {
      setSaved(res.count ?? filled.length);
      setRows([emptyRow(defaultDate), emptyRow(defaultDate)]);
    }
  };

  const cell = "w-full rounded border border-(--color-line) bg-white px-2 py-1 text-sm outline-none focus:border-(--color-accent)";

  return (
    <div>
      <div className="mb-2 text-xs text-(--color-dim)">
        キャディを選ぶと時給が自動で入ります。金額（時間×時給）はキャディ→YOZAN請求書に合算されます
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-(--color-dim)">
            <tr>
              <th className="w-48 pb-1">キャディ</th>
              <th className="w-32 pb-1">勤務日</th>
              <th className="w-24 pb-1">時間</th>
              <th className="w-24 pb-1">時給</th>
              <th className="w-28 pb-1 text-right">金額</th>
              <th className="pb-1">メモ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const amount = Math.round(Number(r.hours || 0) * Number(r.wage || 0));
              return (
                <tr key={i}>
                  <td className="py-0.5 pr-1">
                    <select
                      value={r.partnerId}
                      onChange={(e) => {
                        const p = partners.find((x) => x.id === e.target.value);
                        update(i, {
                          partnerId: e.target.value,
                          wage: p?.hourly_wage ? String(p.hourly_wage) : r.wage,
                        });
                      }}
                      className={cell}
                    >
                      <option value="">選択</option>
                      {partners.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {p.hourly_wage ? `（¥${p.hourly_wage}/h）` : "（時給未設定）"}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-0.5 pr-1">
                    <input type="date" value={r.date} onChange={(e) => update(i, { date: e.target.value })} className={cell} />
                  </td>
                  <td className="py-0.5 pr-1">
                    <input
                      type="number"
                      step="0.25"
                      value={r.hours}
                      onChange={(e) => update(i, { hours: e.target.value })}
                      className={`${cell} text-right tabular-nums`}
                      placeholder="0"
                    />
                  </td>
                  <td className="py-0.5 pr-1">
                    <input
                      type="number"
                      value={r.wage}
                      onChange={(e) => update(i, { wage: e.target.value })}
                      className={`${cell} text-right tabular-nums`}
                      placeholder="0"
                    />
                  </td>
                  <td className="py-0.5 pr-1 text-right tabular-nums text-(--color-dim)">
                    {amount > 0 ? `¥${amount.toLocaleString()}` : "—"}
                  </td>
                  <td className="py-0.5 pr-1">
                    <input type="text" value={r.memo} onChange={(e) => update(i, { memo: e.target.value })} className={cell} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setRows((p) => [...p, emptyRow(defaultDate)])}
          className="rounded-lg border border-(--color-line) px-3 py-1.5 text-sm"
        >
          ＋ 行を追加
        </button>
        <button type="button" onClick={submit} disabled={saving || filled.length === 0} className={btnCls}>
          {saving ? "登録中…" : `${filled.length}件を登録`}
        </button>
        {saved !== null ? <span className="text-sm text-emerald-700">{saved}件を登録しました</span> : null}
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}
