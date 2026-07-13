"use client";

import { useState, useTransition } from "react";
import { setAvailability } from "../actions";

type Status = "available" | "maybe" | "unavailable" | "";

const NEXT: Record<Status, Status> = {
  "": "available",
  available: "maybe",
  maybe: "unavailable",
  unavailable: "",
};

const MARK: Record<Status, string> = {
  "": "",
  available: "○",
  maybe: "△",
  unavailable: "×",
};

const TONE: Record<Status, string> = {
  "": "text-slate-300",
  available: "bg-emerald-50 text-emerald-700 font-bold",
  maybe: "bg-amber-50 text-amber-700",
  unavailable: "bg-slate-100 text-slate-400",
};

const WD = ["日", "月", "火", "水", "木", "金", "土"];

/** クリックで ○→△→×→空欄 と切り替わり、即保存する（楽観更新） */
export function AvailabilityGrid({
  partners,
  days,
  availability,
  dispatched,
  ym,
}: {
  partners: Array<{ id: string; name: string }>;
  days: string[];
  availability: Array<{ partner_id: string; date: string; status: string }>;
  dispatched: Array<{ partner_id: string; dispatch_date: string }>;
  ym: string;
}) {
  const initial = new Map<string, Status>();
  for (const a of availability) initial.set(`${a.partner_id}|${a.date}`, a.status as Status);

  const dispatchedSet = new Set(dispatched.map((d) => `${d.partner_id}|${d.dispatch_date}`));

  const [state, setState] = useState(initial);
  const [, startTransition] = useTransition();

  const toggle = (partnerId: string, date: string) => {
    const key = `${partnerId}|${date}`;
    const cur = state.get(key) ?? "";
    const next = NEXT[cur];
    setState((prev) => {
      const m = new Map(prev);
      if (next === "") m.delete(key);
      else m.set(key, next);
      return m;
    });
    startTransition(async () => {
      await setAvailability(partnerId, date, next);
    });
  };

  const counts = days.map(
    (d) => partners.filter((p) => state.get(`${p.id}|${d}`) === "available").length
  );

  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-(--color-panel) px-2 py-1 text-left">委託先</th>
            {days.map((d) => {
              const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
              return (
                <th
                  key={d}
                  className={`w-8 px-0 py-1 text-center font-normal ${
                    wd === 0 ? "text-red-500" : wd === 6 ? "text-sky-600" : "text-(--color-dim)"
                  }`}
                >
                  <div>{Number(d.slice(-2))}</div>
                  <div className="text-[10px]">{WD[wd]}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {partners.map((p) => (
            <tr key={p.id} className="border-t border-(--color-line)">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-(--color-panel) px-2 py-1">{p.name}</td>
              {days.map((d) => {
                const key = `${p.id}|${d}`;
                const st = (state.get(key) ?? "") as Status;
                const isDispatched = dispatchedSet.has(key);
                return (
                  <td key={d} className="p-0">
                    <button
                      type="button"
                      onClick={() => toggle(p.id, d)}
                      title={isDispatched ? "派遣済み" : "クリックで ○→△→×→空欄"}
                      className={`h-7 w-8 border border-(--color-line) text-center ${TONE[st]} ${
                        isDispatched ? "ring-2 ring-inset ring-sky-400" : ""
                      }`}
                    >
                      {MARK[st] || (isDispatched ? "●" : "")}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="border-t-2 border-(--color-line)">
            <td className="sticky left-0 z-10 bg-(--color-panel) px-2 py-1 font-semibold">出勤可 人数</td>
            {counts.map((c, i) => (
              <td key={i} className="px-0 py-1 text-center tabular-nums">
                {c || ""}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <p className="mt-3 text-xs text-(--color-dim)">
        {ym} / 委託先 {partners.length}名。最下段は「その日に出られるキャディの人数」です。
      </p>
    </div>
  );
}
