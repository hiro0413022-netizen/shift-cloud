"use client";

import { useState, useTransition } from "react";
import { saveDraft, publishShifts, type CellShift } from "./actions";
import { Button } from "@/components/ui";

type Template = { id: string; name: string; start_time: string | null; end_time: string | null; is_day_off: boolean; color: string };
type StaffRow = { id: string; name: string };
type Shift = { staff_id: string; date: string; template_id: string | null; status: string };
type Request = { staff_id: string; date: string; template_id: string | null; memo: string | null };

/** テンプレートの表示: 時間があれば "10:00-17:00"、なければ名前 */
function tLabel(t: Template) {
  if (t.is_day_off) return "休み";
  if (t.start_time && t.end_time) return `${t.start_time.slice(0, 5)}-${t.end_time.slice(0, 5)}`;
  return t.name;
}

export function ShiftBuilder({
  storeId, ym, days, staff, templates, shifts, requests,
}: {
  storeId: string;
  ym: string;
  days: string[];
  staff: StaffRow[];
  templates: Template[];
  shifts: Shift[];
  requests: Request[];
}) {
  // 現在の割当: key = staffId|date
  const init: Record<string, { template_id: string | null; status: string }> = {};
  for (const s of shifts) init[`${s.staff_id}|${s.date}`] = { template_id: s.template_id, status: s.status };
  const [grid, setGrid] = useState(init);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const reqMap = new Map<string, Request>();
  for (const r of requests) reqMap.set(`${r.staff_id}|${r.date}`, r);
  const tmap = new Map(templates.map((t) => [t.id, t]));

  function setCell(staffId: string, date: string, templateId: string) {
    const key = `${staffId}|${date}`;
    setGrid((p) => ({ ...p, [key]: { template_id: templateId || null, status: "draft" } }));
    setDirty((p) => new Set(p).add(key));
  }

  function save() {
    const cells: CellShift[] = [...dirty].map((key) => {
      const [staff_id, date] = key.split("|");
      return { staff_id, date, template_id: grid[key]?.template_id ?? null };
    });
    start(async () => {
      const res = await saveDraft(storeId, cells);
      setMsg(res.error ?? "ドラフト保存しました ✓");
      if (!res.error) setDirty(new Set());
    });
  }

  function publish() {
    if (!confirm(`${ym.replace("-", "年")}月のドラフトをすべて確定し、スタッフに通知します。よろしいですか？`)) return;
    start(async () => {
      const res = await publishShifts(storeId, ym);
      setMsg(res.error ?? `${res.published}件のシフトを確定しました ✓`);
    });
  }

  const dow = ["日", "月", "火", "水", "木", "金", "土"];

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <Button onClick={save} disabled={pending || dirty.size === 0}>
          {pending ? "処理中…" : `ドラフト保存（${dirty.size}件）`}
        </Button>
        <Button variant="secondary" onClick={publish} disabled={pending}>月内ドラフトを確定・通知</Button>
        {msg && <p className="text-sm font-medium text-brand">{msg}</p>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
        <table className="text-xs">
          <thead>
            <tr className="bg-zinc-50">
              <th className="sticky left-0 z-10 min-w-28 border-b border-r border-zinc-200 bg-zinc-50 px-3 py-2 text-left font-medium">スタッフ</th>
              {days.map((d) => {
                const w = dow[new Date(d + "T00:00:00+09:00").getDay()];
                return (
                  <th key={d} className={`min-w-24 border-b border-zinc-200 px-1 py-2 font-medium ${w === "日" ? "text-red-500" : w === "土" ? "text-blue-500" : "text-zinc-500"}`}>
                    {d.slice(8)}<span className="block text-[10px]">（{w}）</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="sticky left-0 z-10 border-b border-r border-zinc-100 bg-white px-3 py-1 font-medium">{s.name}</td>
                {days.map((d) => {
                  const key = `${s.id}|${d}`;
                  const cell = grid[key];
                  const req = reqMap.get(key);
                  const t = cell?.template_id ? tmap.get(cell.template_id) : null;
                  return (
                    <td key={d} className={`border-b border-zinc-100 p-0.5 ${cell?.status === "published" ? "bg-emerald-50/60" : dirty.has(key) ? "bg-amber-50" : ""}`}>
                      <select
                        value={cell?.template_id ?? ""}
                        onChange={(e) => setCell(s.id, d, e.target.value)}
                        className="w-full cursor-pointer rounded border-0 bg-transparent px-1 py-1 text-[11px] focus:outline-none"
                        style={t ? { color: t.color, fontWeight: 600 } : undefined}
                      >
                        <option value="">—</option>
                        {templates.map((tp) => (
                          <option key={tp.id} value={tp.id}>{tLabel(tp)}</option>
                        ))}
                      </select>
                      {req && (
                        <p
                          className="truncate px-1 pb-0.5 text-[10px] text-zinc-400"
                          title={`希望: ${req.template_id ? (() => { const rt = tmap.get(req.template_id); return rt ? `${rt.name}（${tLabel(rt)}）` : ""; })() : ""}${req.memo ? ` / ${req.memo}` : ""}`}
                        >
                          希望: {req.template_id ? (() => { const rt = tmap.get(req.template_id); return rt ? tLabel(rt) : "—"; })() : "メモ"}
                          {req.memo ? " 📝" : ""}
                        </p>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-400">緑=確定済み / 黄=未保存の変更。セル下の「希望」はスタッフの提出内容（📝=メモあり、ホバーで表示）。</p>
    </div>
  );
}
