"use client";

import { useMemo, useState, useTransition } from "react";
import { submitSelfAvailability } from "../../actions";
import { shortCourseName } from "@/lib/shift";

type Status = "available" | "maybe" | "unavailable" | "";
type Day = { st: Status; ids: string[] };
type Course = { id: string; name: string };

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
const canWork = (st: Status) => st === "available" || st === "maybe";

/**
 * 本人のシフト提出。
 *
 * ゴルフ場の選択（2026-09-20・migration 0195）:
 *  - 担当ゴルフ場が2つ以上の人だけ、日ごとに「どこで出られるか」を複数選べる。
 *    ○/△ を付けた瞬間は担当ぜんぶにチェックが入り、下の一覧で外せる（最低1つは残す）。
 *  - 担当が1つ（または未登録）の人は今までどおり。ゴルフ場はサーバーが自動で入れる。
 */
export function SelfSubmit({
  token,
  months,
  availability,
  confirmed,
  courses,
}: {
  token: string;
  months: string[];
  availability: Array<{ date: string; status: string; memo: string | null; client_ids: string[] | null }>;
  confirmed: Array<{ date: string; client_name: string }>;
  courses: Course[];
}) {
  const [state, setState] = useState<Map<string, Day>>(
    () => new Map(availability.map((a) => [a.date, { st: a.status as Status, ids: a.client_ids ?? [] }]))
  );
  const [ym, setYm] = useState(months[0]);
  const [last, setLast] = useState<string | null>(null);
  const [, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const multi = courses.length >= 2;
  const allIds = useMemo(() => courses.map((c) => c.id), [courses]);
  const courseName = useMemo(() => new Map(courses.map((c) => [c.id, c.name])), [courses]);

  const confirmedMap = useMemo(() => new Map(confirmed.map((c) => [c.date, c.client_name])), [confirmed]);

  const days = useMemo(() => {
    const [y, m] = ym.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Array.from({ length: lastDay }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
  }, [ym]);

  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  const flash = (m: { ok: boolean; text: string }) => {
    setMsg(m);
    setTimeout(() => setMsg(null), m.ok ? 2000 : 5000);
  };

  /** 保存（画面は先に変え、失敗したら元に戻す） */
  const save = (date: string, next: Day, prev: Day | undefined) => {
    setState((cur) => {
      const m = new Map(cur);
      if (next.st === "") m.delete(date);
      else m.set(date, next);
      return m;
    });
    start(async () => {
      const r = await submitSelfAvailability(token, date, next.st, undefined, canWork(next.st) ? next.ids : []);
      if (r.error) {
        setState((cur) => {
          const m = new Map(cur);
          if (prev) m.set(date, prev);
          else m.delete(date);
          return m;
        });
        flash({ ok: false, text: r.error });
      } else {
        flash({ ok: true, text: "保存しました" });
      }
    });
  };

  const tap = (date: string) => {
    if (date < today) return; // 過ぎた日は触らせない
    if (confirmedMap.has(date)) return; // 確定済みの日は本人操作で消させない（担当者へ連絡してもらう）
    const prev = state.get(date);
    const st = NEXT[prev?.st ?? ""];
    // ○→△ のようにゴルフ場の選択は引き継ぐ。新しく○/△にしたときは担当ぜんぶ
    const ids = canWork(st) ? (prev && canWork(prev.st) && prev.ids.length ? prev.ids : allIds) : [];
    setLast(date);
    save(date, { st, ids }, prev);
  };

  const toggleCourse = (date: string, id: string) => {
    const prev = state.get(date);
    if (!prev || !canWork(prev.st)) return;
    const has = prev.ids.includes(id);
    const ids = has ? prev.ids.filter((x) => x !== id) : [...prev.ids, id];
    if (ids.length === 0) {
      flash({ ok: false, text: "ゴルフ場は1つ以上選んでください（出られない日は × にしてください）" });
      return;
    }
    setLast(date);
    save(date, { st: prev.st, ids }, prev);
  };

  const lead = new Date(`${days[0]}T00:00:00Z`).getUTCDay();
  const cells: Array<string | null> = [...Array<null>(lead).fill(null), ...days];
  const okCount = days.filter((d) => state.get(d)?.st === "available").length;
  // ゴルフ場を選ぶ一覧＝この月で ○/△ を付けた日（これから先の日だけ）
  const workDays = days.filter((d) => d >= today && !confirmedMap.has(d) && canWork(state.get(d)?.st ?? ""));
  const initial = (id: string) => shortCourseName(courseName.get(id)).slice(0, 1);

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
            const day = state.get(d);
            const st = (day?.st ?? "") as Status;
            const past = d < today;
            const fixed = confirmedMap.get(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => tap(d)}
                disabled={past || !!fixed}
                className={`flex h-14 flex-col items-center justify-center rounded-lg border ${
                  last === d ? "border-(--color-accent)" : "border-(--color-line)"
                } ${fixed ? "bg-sky-50 text-sky-700" : TONE[st]} ${past ? "opacity-40" : ""}`}
              >
                <span className="text-[11px]">{Number(d.slice(-2))}</span>
                <span className="text-base leading-none">{fixed ? "勤" : MARK[st]}</span>
                {multi && !fixed && canWork(st) && day ? (
                  <span className="mt-0.5 text-[9px] font-normal leading-none text-slate-500">
                    {day.ids.map(initial).join("")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-sm">
        {Number(ym.slice(5))}月の出勤可能日: <b>{okCount}</b> 日
        {msg ? (
          <span className={`ml-2 text-xs ${msg.ok ? "text-(--color-dim)" : "text-red-600"}`}>{msg.text}</span>
        ) : null}
      </p>

      {/* ── 日ごとのゴルフ場（担当が2つ以上の人だけ） ── */}
      {multi ? (
        <div className="mt-4">
          <p className="text-sm font-medium">出勤できるゴルフ場</p>
          <p className="mb-2 text-[11px] text-(--color-dim)">
            ○/△ を付けた日は担当のゴルフ場すべてにチェックが入ります。出られないゴルフ場はタップして外してください。
          </p>
          {workDays.length === 0 ? (
            <p className="rounded-lg border border-dashed border-(--color-line) px-3 py-3 text-xs text-(--color-dim)">
              上のカレンダーで ○ か △ を付けると、ここでゴルフ場を選べます
            </p>
          ) : (
            <ul className="space-y-1.5">
              {workDays.map((d) => {
                const day = state.get(d)!;
                return (
                  <li
                    key={d}
                    className={`rounded-lg border bg-white px-3 py-2 ${
                      last === d ? "border-(--color-accent)" : "border-(--color-line)"
                    }`}
                  >
                    <div className="mb-1.5 text-sm">
                      <b>{MARK[day.st]}</b> {d.slice(5).replace("-", "/")}（{WD[new Date(`${d}T00:00:00Z`).getUTCDay()]}）
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {courses.map((c) => {
                        const on = day.ids.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleCourse(d, c.id)}
                            aria-pressed={on}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                              on
                                ? "border-emerald-400 bg-emerald-50 font-medium text-emerald-800"
                                : "border-(--color-line) bg-white text-slate-400"
                            }`}
                          >
                            {on ? "☑" : "☐"} {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      <div className="mt-3 rounded-lg bg-(--color-panel-2) p-3 text-xs text-(--color-dim)">
        日付をタップするたびに <b>○（出られる）→ △（要相談）→ ×（出られない）→ 未回答</b> と切り替わり、その場で保存されます。
        {multi ? (
          <>
            <br />
            日付の下の小さな文字は、出られるゴルフ場の頭文字です（
            {courses.map((c) => `${initial(c.id)}＝${shortCourseName(c.name)}`).join("・")}）。
          </>
        ) : null}
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
