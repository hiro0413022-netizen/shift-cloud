"use client";

import { useState, useTransition } from "react";
import { submitRequests, type RequestEntry } from "./actions";
import { Button } from "@/components/ui";

type Template = { id: string; name: string; start_time: string | null; end_time: string | null; is_day_off: boolean; color: string };
type Existing = { date: string; template_id: string | null; memo: string | null };

export function RequestForm({
  periodId, days, templates, existing,
}: {
  periodId: string;
  days: string[];
  templates: Template[];
  existing: Existing[];
  }) {
  const init: Record<string, { template_id: string | null; memo: string }> = {};
  for (const e of existing) init[e.date] = { template_id: e.template_id, memo: e.memo ?? "" };
  const [entries, setEntries] = useState(init);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const dow = ["日", "月", "火", "水", "木", "金", "土"];

  function setTemplate(date: string, templateId: string) {
    setEntries((prev) => {
      const cur = prev[date];
      // 同じテンプレを再タップで解除
      if (cur?.template_id === templateId) {
        const next = { ...prev };
        next[date] = { ...cur, template_id: null };
        return next;
      }
      return { ...prev, [date]: { template_id: templateId, memo: cur?.memo ?? "" } };
    });
  }

  function setMemo(date: string, memo: string) {
    setEntries((prev) => ({ ...prev, [date]: { template_id: prev[date]?.template_id ?? null, memo } }));
  }

  function submit() {
    const payload: RequestEntry[] = Object.entries(entries).map(([date, v]) => ({
      date, template_id: v.template_id, memo: v.memo,
    }));
    start(async () => {
      const res = await submitRequests(periodId, payload);
      setMsg(res.error ?? "提出しました ✓");
    });
  }

  const filled = Object.values(entries).filter((e) => e.template_id).length;

  return (
    <div className="space-y-2 pb-24">
      {days.map((d) => {
        const w = dow[new Date(d + "T00:00:00+09:00").getDay()];
        const cur = entries[d];
        return (
          <div key={d} className="rounded-lg border border-zinc-200 bg-white p-3">
            <p className={`mb-2 text-sm font-medium ${w === "日" ? "text-red-500" : w === "土" ? "text-blue-500" : ""}`}>
              {d.slice(8)}日（{w}）
            </p>
            <div className="flex flex-wrap gap-1.5">
              {templates.map((t) => {
                const sel = cur?.template_id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplate(d, t.id)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      sel ? "border-transparent text-white" : "border-zinc-300 text-zinc-600"
                    }`}
                    style={sel ? { background: t.color } : undefined}
                  >
                    {t.name}
                    {t.start_time && !t.is_day_off ? ` ${t.start_time.slice(0, 5)}〜${t.end_time?.slice(0, 5)}` : ""}
                  </button>
                );
              })}
            </div>
            <input
              className="mt-2 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand focus:outline-none"
              placeholder="メモ（例: 17時以降なら残れます）"
              value={cur?.memo ?? ""}
              onChange={(e) => setMemo(d, e.target.value)}
            />
          </div>
        );
      })}

      <div className="fixed inset-x-0 bottom-14 z-10 mx-auto max-w-lg border-t border-zinc-200 bg-white/95 p-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <p className="flex-1 text-xs text-zinc-500">{filled}日分 入力済み {msg && <span className="ml-2 font-medium text-brand">{msg}</span>}</p>
          <Button onClick={submit} disabled={pending}>{pending ? "提出中…" : "希望を提出"}</Button>
        </div>
      </div>
    </div>
  );
}
