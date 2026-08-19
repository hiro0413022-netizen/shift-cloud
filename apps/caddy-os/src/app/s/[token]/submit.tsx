"use client";

import { useMemo, useState, useTransition } from "react";
import { submitSelfAvailability } from "../../actions";

type Status = "available" | "maybe" | "unavailable" | "";

/** タップするたび ○ → △ → × → 未回答 と回る。指1本で1ヶ月ぶん入れられる形にしている */
const NEXT: Record<Status, Status> = { "": "available", available: "maybe", maybe: "unavailable", unavailable: "" };
const MARK: Record<Status, string> = { "": "－", available: "○", maybe: "△", unavailable: "×" };
const TONE: Record<Status, string> = {
  "": "bg-white text-slate-300",
  available: "bg-emerald-50 text-emerald-700 font-bold",
  maybe: "bg-amber-50 text-amber-700",
  unavailable: "bg-slate-100 text-slate-400",
};
const WD = ["日", "月", "火", "水", "木", "金", "土"];

export function SelfSubmit({
  token,
  months,
  availability,
  confirmed,
}: {
  token: string;
  months: string[];
  availability: Array<{ date: string; status: string; memo: string | null }>;
  confirmed: Array<{ date: string; client_name: string }>;
}) {
  const [state, setState] = useState<Map<string, Status>>(
    () => new Map(availability.map((a) => [a.date, a.status as Status]))
  );
  const [ym, setYm] = useState(months[0]);
  const [, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const confirmedMap = useMemo(() => new Map(confirmed.map((c) => [c.date, c.client_name])), [confirmed]);

  const days = useMemo(() => {
    const [y, m] = ym.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Array.from({ length: last }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
  }, [ym]);

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  const tap = (date: string) => {
    if (date < today) return; // 過ぎた日は触らせない
    if (confirmedMap.has(date)) return; // 確定済みの日は本人操作で消させない（担当者へ連絡してもらう）
    const cur = state.get(date) ?? "";
    const next = NEXT[cur];
    setState((prev) => {
      const m = new Map(prev);
      if (next === "") m.delete(date);
      else m.set(date, next);
      return m;
    });
    start(async () => {
      const r = await submitSelfAvailability(token, date, next);
      setMsg(r.error ?? "保存しました");
      setTimeout(() => setMsg(null), 2000);
    });
  };

  const lead = new Date(`${days[0]}T00:00:00Z`).getUTCDay();
  const cells: Array<string | null> = [...Array<null>(lead).fill(null), ...days];
  const okCount = days.filter((d) => state.get(d) === "available").length;

  return (
    <div>
      <div className="mb-3 flex gap-2">
        {months.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setYm(m)}
            className={`flex-1 rounded-lg border px-2 py-2 text-sm ${
              m === ym ? "border-(--color-accent) bg-(--color-accent) text-white" : "border-(--color-line) bg-white"
            }`}
          >
            {Number(m.slice(5))}月
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-(--color-dim)">
          {WD.map((w, i) => (
            <div key={w} className={i === 0 ? "text-red-500" : i === 6 ? "text-sky-600" : ""}>
              {w}
            </div>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const st = (state.get(d) ?? "") as Status;
            const past = d < today;
            const fixed = confirmedMap.get(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => tap(d)}
                disabled={past || !!fixed}
                className={`flex h-14 flex-col items-center justify-center rounded-lg border border-(--color-line) ${
                  fixed ? "bg-sky-50 text-sky-700" : TONE[st]
                } ${past ? "opacity-40" : ""}`}
              >
                <span className="text-[11px]">{Number(d.slice(-2))}</span>
                <span className="text-base leading-none">{fixed ? "勤" : MARK[st]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-sm">
        {Number(ym.slice(5))}月の出勤可能日: <b>{okCount}</b> 日
        {msg ? <span className="ml-2 text-xs text-(--color-dim)">{msg}</span> : null}
      </p>

      <div className="mt-3 rounded-lg bg-(--color-panel-2) p-3 text-xs text-(--color-dim)">
        日付をタップするたびに <b>○（出られる）→ △（要相談）→ ×（出られない）→ 未回答</b> と切り替わり、その場で保存されます。
        <br />
        <span className="text-sky-700">青い「勤」</span>は派遣が確定した日です。変更が必要なときは担当者へご連絡ください。
      </div>

      {confirmed.length > 0 ? (
        <div className="mt-4">
          <p className="mb-1 text-sm font-medium">確定している勤務</p>
          <ul className="space-y-1 text-sm">
            {confirmed.map((c) => (
              <li key={c.date} className="rounded-lg border border-(--color-line) bg-white px-3 py-2">
                {c.date.slice(5).replace("-", "/")}（{WD[new Date(`${c.date}T00:00:00Z`).getUTCDay()]}） {c.client_name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
