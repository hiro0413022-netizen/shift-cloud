"use client";

import { useState, useTransition } from "react";
import { recordTime, saveKioskMessage, type ClockType } from "./actions";

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
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgKind, setMsgKind] = useState<"message" | "missing_clock">("message");
  const [msgBody, setMsgBody] = useState("");
  const [msgSent, setMsgSent] = useState(false);

  function sendMessage() {
    if (!msgBody.trim() || pending) return;
    start(async () => {
      const res = await saveKioskMessage(token, selected?.id ?? null, msgKind, msgBody);
      if (res.error) { setError(res.error); return; }
      setMsgSent(true);
      setMsgBody("");
      setTimeout(() => { setMsgOpen(false); setMsgSent(false); setSelected(null); }, 1800);
    });
  }

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

  if (msgOpen) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-100 p-8">
        {msgSent ? (
          <>
            <p className="text-6xl">✓</p>
            <p className="mt-6 text-3xl font-bold">送信しました</p>
            <p className="mt-2 text-lg text-zinc-500">管理者が確認します</p>
          </>
        ) : (
          <div className="w-full max-w-2xl">
            <p className="text-3xl font-bold">{selected ? `${selected.name} さん` : storeName}</p>
            <p className="mt-1 text-lg text-zinc-500">管理者への連絡・打刻忘れの報告</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setMsgKind("message")}
                className={`flex-1 rounded-xl py-4 text-xl font-bold ${msgKind === "message" ? "bg-brand text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-300"}`}>
                伝えたいこと
              </button>
              <button onClick={() => setMsgKind("missing_clock")}
                className={`flex-1 rounded-xl py-4 text-xl font-bold ${msgKind === "missing_clock" ? "bg-amber-500 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-300"}`}>
                打刻の押し忘れ
              </button>
            </div>
            <textarea
              value={msgBody}
              onChange={(e) => setMsgBody(e.target.value)}
              rows={4}
              placeholder={msgKind === "missing_clock" ? "例: 18:00に退勤しましたが押し忘れました" : "例: レジの釣り銭が不足しています"}
              className="mt-4 w-full rounded-xl border border-zinc-300 p-4 text-xl focus:border-brand focus:outline-none"
            />
            {error && <p className="mt-3 text-lg text-red-600">{error}</p>}
            <div className="mt-4 flex gap-3">
              <button onClick={() => { setMsgOpen(false); setError(""); setMsgBody(""); }}
                className="flex-1 rounded-xl bg-white py-4 text-xl font-bold text-zinc-500 ring-1 ring-zinc-300">キャンセル</button>
              <button onClick={sendMessage} disabled={pending || !msgBody.trim()}
                className="flex-1 rounded-xl bg-emerald-600 py-4 text-xl font-bold text-white disabled:opacity-50">送信する</button>
            </div>
          </div>
        )}
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
        <div className="mt-10 flex items-center gap-8">
          <button onClick={() => { setSelected(null); setError(""); }} className="text-xl text-zinc-400">← 戻る</button>
          <button onClick={() => { setMsgOpen(true); setError(""); }} className="rounded-xl bg-white px-6 py-3 text-xl font-medium text-brand ring-1 ring-brand/30">
            📝 連絡・打刻忘れの報告
          </button>
        </div>
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
