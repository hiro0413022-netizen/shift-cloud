"use client";

import { useState, useTransition } from "react";
import { setHoleScore } from "../actions";
import { calcPeriaHcp, declaredHcp, formatNet, isPeria } from "@yozan/core/compe-score";

type Row = { id: string; name: string; hcp: number | null; holes: Record<string, number> };

export function HoleGrid({ compId, format, rows }: { compId: string; format: string; rows: Row[] }) {
  const [local, setLocal] = useState<Record<string, Record<string, number>>>(
    Object.fromEntries(rows.map((r) => [r.id, { ...r.holes }]))
  );
  const [, startTransition] = useTransition();
  const peria = isPeria(format);

  const change = (pid: string, hole: number, raw: string) => {
    const v = raw === "" ? null : Number.parseInt(raw, 10);
    setLocal((s) => {
      const next = { ...(s[pid] ?? {}) };
      if (v == null || Number.isNaN(v)) delete next[`h${hole}`];
      else next[`h${hole}`] = v;
      return { ...s, [pid]: next };
    });
    startTransition(() => {
      void setHoleScore(compId, pid, hole, v == null || Number.isNaN(v) ? null : v);
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="text-center text-sm">
        <thead>
          <tr className="bg-(--color-accent) text-white">
            <th className="min-w-28 px-2 py-1.5 text-left">選手名</th>
            <th className="px-2 py-1.5">HCP</th>
            {Array.from({ length: 9 }, (_, i) => (
              <th key={i} className="w-11 px-1 py-1.5">
                {i + 1}
              </th>
            ))}
            <th className="bg-(--color-accent-2) px-2 py-1.5">OUT</th>
            {Array.from({ length: 9 }, (_, i) => (
              <th key={i + 9} className="w-11 px-1 py-1.5">
                {i + 10}
              </th>
            ))}
            <th className="bg-(--color-accent-2) px-2 py-1.5">IN</th>
            <th className="bg-emerald-900 px-2 py-1.5">GROSS</th>
            <th className="bg-emerald-900 px-2 py-1.5">NET</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const holes = local[r.id] ?? {};
            const sum = (from: number, to: number) => {
              let t = 0;
              for (let h = from; h <= to; h += 1) t += holes[`h${h}`] ?? 0;
              return t;
            };
            const out = sum(1, 9);
            const inn = sum(10, 18);
            const gross = out + inn;
            const hcp = peria ? calcPeriaHcp({ holes }, format) : declaredHcp({ id: r.id, name: r.name, hcp: r.hcp });
            return (
              <tr key={r.id} className="border-b border-(--color-line)">
                <td className="px-2 py-1 text-left font-semibold whitespace-nowrap">{r.name}</td>
                <td className="px-2 py-1 text-xs text-(--color-dim)">{peria ? (gross ? hcp.toFixed(1) : "—") : (r.hcp ?? "—")}</td>
                {Array.from({ length: 9 }, (_, i) => i + 1).map((h) => (
                  <td key={h} className="px-0.5 py-1">
                    <HoleInput value={holes[`h${h}`]} onChange={(v) => change(r.id, h, v)} />
                  </td>
                ))}
                <td className="bg-(--color-panel-2) px-2 py-1 font-bold">{out || ""}</td>
                {Array.from({ length: 9 }, (_, i) => i + 10).map((h) => (
                  <td key={h} className="px-0.5 py-1">
                    <HoleInput value={holes[`h${h}`]} onChange={(v) => change(r.id, h, v)} />
                  </td>
                ))}
                <td className="bg-(--color-panel-2) px-2 py-1 font-bold">{inn || ""}</td>
                <td className="bg-emerald-50 px-2 py-1 font-bold">{gross || ""}</td>
                <td className="bg-emerald-50 px-2 py-1 font-bold">{gross ? formatNet(gross - hcp) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HoleInput({ value, onChange }: { value: number | undefined; onChange: (raw: string) => void }) {
  return (
    <input
      type="number"
      min={1}
      max={20}
      inputMode="numeric"
      defaultValue={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-10 rounded border border-(--color-line) px-1 py-1 text-center focus:border-(--color-accent) focus:outline-none"
    />
  );
}
