"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { coveredCells } from "@yozan/core/frank-booking";

/**
 * 会員ポータルの打席予約（#188）
 *
 * これまでお客様の予約は公式サイト frankgolf.jp/booking.html だけにあり、
 * ポータルの「＋ Web予約する」は**別ドメインへ飛ばすだけ**だった。
 * お客様から見ると入口が2つあることになり、メールに載せるURLも2種類になっていた。
 * ユーザー判断（2026-09-01）で「お客様が入るページは my.frankgolf.jp だけ」に変えたので、
 * 予約画面そのものをポータルの中に置く。
 *
 * ⚠ **台帳とロジックは増やさない**（#93）。予約の作成・キャンセル・空き判定は
 *   従来どおり genesis の公開API `/api/public/frank/booking` が唯一の窓口で、
 *   この画面はその**表示**にすぎない。空き枠の数え方（coveredCells）も
 *   @yozan/core と同じものを使う＝サイトと portal で「○なのに取れない」が出ないようにする。
 *
 * 認証は #152 の引き渡しトークン（会員番号＋期限だけを署名したもの）。
 * ポータルにログイン済みなので、ここで会員番号と電話下4桁を聞き直さない。
 */

type Bay = { id: string; code: string; name: string; equipment?: string | null };
type Slots = {
  closed?: boolean;
  reason?: string;
  min_date?: string;
  max_date?: string;
  grain?: number;
  hours: { open: string; close: string };
  slots: string[];
  bays: Bay[];
  taken: Record<string, string[]>;
  minutes_options?: number[];
  lesson_option?: { minutes: number; price: number } | null;
};

const LABEL: Record<number, string> = { 30: "30分", 60: "1時間", 90: "1時間30分", 120: "2時間", 150: "2時間30分", 180: "3時間" };
const toM = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toT = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const jstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export function BookClient({ apiBase, token }: { apiBase: string; token: string }) {
  const router = useRouter();
  const API = `${apiBase}/api/public/frank/booking`;

  const [date, setDate] = useState(jstToday());
  const [minutes, setMinutes] = useState(60);
  const [data, setData] = useState<Slots | null>(null);
  const [status, setStatus] = useState("読み込み中…");
  const [sel, setSel] = useState<{ bay: string; t: string } | null>(null);
  const [lesson, setLesson] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  // オープン前の日付を1度だけ自動で先送りする（毎回やると日付を選び直せなくなる）
  const retried = useRef(false);

  const load = useCallback(
    async (d: string) => {
      setSel(null);
      setErr("");
      setStatus("読み込み中…");
      setData(null);
      try {
        const j = (await (await fetch(`${API}?date=${d}`)).json()) as Slots;
        if (j.closed) {
          setStatus(j.reason || "この日は休業日です。別の日付をお選びください。");
          if (!retried.current && j.min_date && d < j.min_date) {
            retried.current = true;
            setDate(j.min_date);
          }
          return;
        }
        setData(j);
        const opts = j.minutes_options ?? [60];
        setMinutes((cur) => (opts.includes(cur) ? cur : opts[0]));
      } catch {
        setStatus("読み込みに失敗しました。時間をおいてお試しください。");
      }
    },
    [API],
  );

  useEffect(() => {
    void load(date);
  }, [date, load]);

  /** その打席・その開始時刻で、選んだ利用時間ぶん続けて空いているか（サイトと同じ数え方） */
  const freeAt = useCallback(
    (bayId: string, t: string, mins: number) => {
      if (!data?.hours) return false;
      if (toM(t) + mins > toM(data.hours.close)) return false; // 閉店をまたぐ枠は出さない
      const used = data.taken?.[bayId] ?? [];
      return coveredCells(t, toT(toM(t) + mins), data.grain || 30).every((c) => !used.includes(c));
    },
    [data],
  );

  // 利用時間を変えたら、選んでいた枠がまだ続けて空いているか見直す
  useEffect(() => {
    if (!sel || !data) return;
    const bay = data.bays.find((b) => b.code === sel.bay);
    if (!bay || !freeAt(bay.id, sel.t, minutes)) setSel(null);
  }, [minutes, data, sel, freeAt]);

  const anyFree = useMemo(
    () => Boolean(data && data.bays.some((b) => data.slots.some((t) => freeAt(b.id, t, minutes)))),
    [data, minutes, freeAt],
  );

  async function book() {
    if (!sel || sending) return;
    setSending(true);
    setErr("");
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "book",
          date,
          bay_code: sel.bay,
          start: sel.t,
          minutes,
          lesson: lesson && !!data?.lesson_option,
          t: token,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (j.ok) {
        // 予約一覧はマイページが持っている（台帳を2箇所で描かない）
        router.push("/member?booked=1");
        router.refresh();
        return;
      }
      setErr(j.error || "予約できませんでした");
      void load(date);
    } catch {
      setErr("通信に失敗しました。時間をおいてお試しください。");
    } finally {
      setSending(false);
    }
  }

  const opts = data?.minutes_options ?? [60];
  const lessonOpt = data?.lesson_option ?? null;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-4">
        <h2 className="mb-2 text-sm font-semibold">1. 日付と利用時間</h2>
        <div className="flex flex-wrap gap-2">
          <input
            type="date"
            value={date}
            min={data?.min_date}
            max={data?.max_date}
            onChange={(e) => {
              retried.current = false;
              setDate(e.target.value);
            }}
            className="flex-1 rounded-xl border border-(--color-line) bg-(--color-panel-2) px-3 py-3 text-base"
          />
          <select
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="rounded-xl border border-(--color-line) bg-(--color-panel-2) px-3 py-3 text-base"
          >
            {opts.map((m) => (
              <option key={m} value={m}>
                {LABEL[m] || `${m}分`}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-4">
        <h2 className="mb-2 text-sm font-semibold">2. 空いている枠（○）をタップ</h2>
        {data ? (
          <>
            <div className="-mx-1 overflow-x-auto">
              <table className="min-w-[520px] border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left">打席</th>
                    {data.slots.map((t) => (
                      <th key={t} className="px-1 py-1 font-normal opacity-70">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.bays.map((b) => (
                    <tr key={b.id}>
                      <td className="whitespace-nowrap px-2 py-1">
                        {b.name}
                        <br />
                        <span className="opacity-60">{b.equipment ?? ""}</span>
                      </td>
                      {data.slots.map((t) =>
                        freeAt(b.id, t, minutes) ? (
                          <td key={t} className="p-0.5 text-center">
                            <button
                              type="button"
                              onClick={() => setSel({ bay: b.code, t })}
                              className={`rounded-md border border-(--color-line) px-2 py-0.5 ${
                                sel?.bay === b.code && sel?.t === t ? "bg-emerald-600/25 font-bold" : ""
                              }`}
                            >
                              ○
                            </button>
                          </td>
                        ) : (
                          <td key={t} className="p-0.5 text-center opacity-25">
                            ×
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-(--color-dim)">
              {anyFree
                ? `営業 ${data.hours.open}〜${data.hours.close}・毎時00分スタート`
                : `この日は「${LABEL[minutes] || `${minutes}分`}」で続けて空いている枠がありません。利用時間や日付を変えてお試しください。`}
            </p>
          </>
        ) : (
          <p className="text-xs text-(--color-dim)">{status}</p>
        )}
      </section>

      {lessonOpt && (
        <section className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-4">
          <h2 className="mb-2 text-sm font-semibold">3. オプション（任意）</h2>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={lesson} onChange={(e) => setLesson(e.target.checked)} className="mt-1" />
            <span>
              パーソナルレッスン（{lessonOpt.minutes}分）を追加する　＋{lessonOpt.price.toLocaleString()}円（当日精算）
              <br />
              <span className="text-xs text-(--color-dim)">
                担当プロと開始時刻は店舗で調整のうえ、確定をご連絡します。
              </span>
            </span>
          </label>
        </section>
      )}

      {err && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">{err}</p>}

      {sel && (
        <button
          type="button"
          onClick={book}
          disabled={sending}
          className="w-full rounded-xl bg-sky-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-sky-500 disabled:opacity-50"
        >
          {sending ? "送信中…" : `この枠で予約する（${sel.t}〜${toT(toM(sel.t) + minutes)}）`}
        </button>
      )}
    </div>
  );
}
