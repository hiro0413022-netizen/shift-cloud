"use client";

import { useState, useTransition } from "react";
import { recordTime, type ClockType } from "./actions";

type StaffState = { id: string; name: string; last: string | null };

const ACTIONS: { type: ClockType; label: string; color: string }[] = [
  { type: "clock_in", label: "出勤", color: "bg-emerald-600" },
  { type: "clock_out", label: "退勤", color: "bg-zinc-700" },
  { type: "break_start", label: "休憩開始", color: "bg-amber-500" },
  { type: "break_end", label: "休憩終了", color: "bg-blue-600" },
];

const STATUS: Record<string, string> = {
  clock_in: "勤務中", break_end: "勤務中", break_start: "休憩中", clock_out: "退勤済",
};

export function KioskClient({ token, storeName, staff }: { token: string; storeName: string; staff: StaffState[] }) {
  const [selected, setSelected] = useState<StaffState | null>(null);
  const [done, setDone] = useState<{ name: string; label: string; time: string } | null>(null);
  const [error, setError] = useState("");
  const [states, setStates] = useState(staff);
  const [pending, start] = useTransition();

  function tap(type: ClockType, label: string) {
    if (!selected || pending) return;
    start(async () => {
      const res = await recordTime(token, selected.id, type);
      if (res.error) {
        setError(res.error);
        return;
      }
      const time = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }).format(new Date(res.time!));
      setStates((prev) => prev.map((s) => (s.id === selected.id ? { ...s, last: type } : s)));
      setDone({ name: selected.name, label, time });
      setSelected(null);
      setTimeout(() => setDone(null), 3000);
    });
  }

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-emerald-600 text-white">
        <p className="text-6xl">✓</p>
        <p className="mt-6 text-4xl font-bold">{done.name} さん</p>
        <p className="mt-3 text-5xl font-bold">{done.label} {done.time}</p>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-100 p-8">
        <p className="text-4xl font-bold">{selected.name} さん</p>
        <p className="mt-2 text-lg text-zinc-500">{STATUS[selected.last ?? ""] ?? "未出勤"}</p>
        <div className="mt-10 grid w-full max-w-2xl grid-cols-2 gap-6">
          {ACTIONS.map((a) => (
            <button
              key={a.type}
              onClick={() => tap(a.type, a.label)}
              disabled={pending}
              className={`${a.color} rounded-2xl py-12 text-4xl font-bold text-white shadow-lg transition active:scale-95 disabled:opacity-50`}
            >
              {a.label}
            </button>
          ))}
        </div>
        {error && <p className="mt-6 text-lg text-red-600">{error}</p>}
        <button onClick={() => { setSelected(null); setError(""); }} className="mt-10 text-xl text-zinc-400">← 戻る</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 p-8">
      <div className="mb-8 text-center">
        <p className="text-2xl font-bold">{storeName}</p>
        <p className="mt-1 text-zinc-500">名前を選んでください</p>
      </div>
      <div className="mx-auto grid max-w-4xl grid-cols-3 gap-4 md:grid-cols-4">
        {states.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(s)}
            className="rounded-2xl bg-white py-8 text-center shadow-sm transition active:scale-95"
          >
            <p className="text-2xl font-bold">{s.name}</p>
            <p className={`mt-1 text-sm ${s.last === "clock_in" || s.last === "break_end" ? "text-emerald-600" : s.last === "break_start" ? "text-amber-500" : "text-zinc-400"}`}>
              {STATUS[s.last ?? ""] ?? "未出勤"}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
