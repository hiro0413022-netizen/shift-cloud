"use client";

import { useState, useTransition } from "react";
import { submitRequests, type RequestEntry } from "./actions";
import { Button } from "@/components/ui";

type Template = { id: string; name: string; start_time: string | null; end_time: string | null; is_day_off: boolean; color: string };
type Existing = { date: string; template_id: string | null; memo: string | null; start_time: string | null; end_time: string | null };
type Entry = { template_id: string | null; memo: string; start_time: string; end_time: string; custom: boolean };

export function RequestForm({
  periodId, days, templates, existing,
}: {
  periodId: string; days: string[]; templates: Template[]; existing: Existing[];
}) {
  const init: Record<string, Entry> = {};
  for (const e of existing) {
    init[e.date] = {
      template_id: e.template_id,
      memo: e.memo ?? "",
      start_time: e.start_time?.slice(0, 5) ?? "",
      end_time: e.end_time?.slice(0, 5) ?? "",
      custom: !e.template_id && !!(e.start_time || e.end_time),
    };
  }
  const [entries, setEntries] = useState(init);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const dow = ["日", "月", "火", "水", "木", "金", "土"];

  function upd(date: string, patch: Partial<Entry>) {
    setEntries((prev) => {
      const base: Entry = prev[date] ?? { template_id: null, memo: "", start_time: "", end_time: "", custom: false };
      return { ...prev, [date]: { ...base, ...patch } };
    });
  }
  function pickTemplate(date: string, id: string) {
    const cur = entries[date];
    if (cur?.template_id === id) { upd(date, { template_id: null }); return; }
    upd(date, { template_id: id, custom: false });
  }
  function toggleCustom(date: string) {
    const cur = entries[date];
    upd(date, { custom: !cur?.custom, template_id: null, start_time: cur?.start_time || "10:00", end_time: cur?.end_time || "19:00" });
  }

  function submit() {
    const payload: RequestEntry[] = Object.entries(entries).map(([date, v]) => ({
      date,
      template_id: v.custom ? null : v.template_id,
      memo: v.memo,
      start_time: v.custom ? v.start_time : null,
      end_time: v.custom ? v.end_time : null,
    }));
    start(async () => {
      const res = await submitRequests(periodId, payload);
      setMsg(res.error ?? "提出しました ✓");
    });
  }

  const filled = Object.values(entries).filter((e) => e.template_id || (e.custom && e.start_time && e.end_time)).length;

  return (
    <div className="space-y-2 pb-24">
      {days.map((d) => {
        const w = dow[new Date(d + "T00:00:00Z").getUTCDay()];
        const cur = entries[d];
        return (
          <div key={d} className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
            <p className={`mb-2 text-sm font-semibold ${w === "日" ? "text-red-500" : w === "土" ? "text-blue-500" : ""}`}>
              {d.slice(8)}日（{w}）
            </p>
            <div className="flex flex-wrap gap-1.5">
              {templates.map((t) => {
                const sel = !cur?.custom && cur?.template_id === t.id;
                return (
                  <button key={t.id} type="button" onClick={() => pickTemplate(d, t.id)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${sel ? "border-transparent text-white shadow" : "border-zinc-300 text-zinc-600"}`}
                    style={sel ? { background: t.color } : undefined}>
                    {t.name}{t.start_time && !t.is_day_off ? ` ${t.start_time.slice(0, 5)}〜${t.end_time?.slice(0, 5)}` : ""}
                  </button>
                );
              })}
              <button type="button" onClick={() => toggleCustom(d)}
                className={`rounded-full border px-3 py-1 text-xs transition ${cur?.custom ? "border-transparent bg-brand text-white shadow" : "border-zinc-300 text-zinc-600"}`}>
                ⌚ 時間を指定
              </button>
            </div>

            {cur?.custom && (
              <div className="mt-2 flex items-center gap-2">
                <input type="time" value={cur.start_time} onChange={(e) => upd(d, { start_time: e.target.value })}
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none" />
                <span className="text-sm text-zinc-400">〜</span>
                <input type="time" value={cur.end_time} onChange={(e) => upd(d, { end_time: e.target.value })}
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none" />
              </div>
            )}

            <input
              className="mt-2 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand focus:outline-none"
              placeholder="メモ（例: 17時以降なら残れます）"
              value={cur?.memo ?? ""}
              onChange={(e) => upd(d, { memo: e.target.value })}
            />
          </div>
        );
      })}

      <div className="fixed inset-x-0 bottom-14 z-10 mx-auto max-w-lg border-t border-zinc-200 bg-white/95 p-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <p className="flex-1 text-xs text-zinc-500">{filled}日分 入力済み {msg && <span className="ml-2 font-medium text-brand">{msg}</span>}</p>
          <Button onClick={submit} disabled={pending}>{pending ? "提出中…" : "シフトを提出"}</Button>
        </div>
      </div>
    </div>
  );
}
