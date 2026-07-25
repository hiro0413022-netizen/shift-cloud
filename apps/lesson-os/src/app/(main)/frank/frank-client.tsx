"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createSlots, setSlotStatus, cancelLessonByStaff, saveLessonRecord } from "./actions";

/** FRANK レッスンカレンダー クライアント（#88 §3-4） */

export type CoachOpt = { id: string; name: string };
export type BayOpt = { id: string; name: string };
export type SlotView = {
  id: string;
  date: string;
  start: string;
  end: string;
  status: string; // open | closed
  note: string | null;
  coachId: string;
  coachName: string;
  bayName: string | null;
  booking: {
    id: string;
    status: string; // confirmed | done
    memberName: string;
    memberNo: string;
    studentId: string | null;
    record: string | null;
    handover: string | null;
    prevHandover: string | null;
  } | null;
};

const WD = ["日", "月", "火", "水", "木", "金", "土"];
const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${m}/${day}(${WD[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]})`;
};

export function FrankClient({ slots, coaches, bays, actorName }: { slots: SlotView[]; coaches: CoachOpt[]; bays: BayOpt[]; actorName: string }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [coachFilter, setCoachFilter] = useState<string>("");
  const [openForm, setOpenForm] = useState(false);
  const [recordFor, setRecordFor] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error?: string; created?: number }>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.error) setMsg(r.error);
      else {
        setMsg(r.created !== undefined ? `${r.created}枠を公開しました` : null);
        setOpenForm(false);
        setRecordFor(null);
      }
    });

  const filtered = coachFilter ? slots.filter((s) => s.coachId === coachFilter) : slots;
  const dates = [...new Set(filtered.map((s) => s.date))].sort();

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          FRANK レッスンカレンダー <span className="text-sm font-normal text-(--color-dim)">30日先まで</span>
        </h1>
        <div className="flex items-center gap-2">
          <select value={coachFilter} onChange={(e) => setCoachFilter(e.target.value)} className="input-dark text-sm">
            <option value="">全コーチ</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button onClick={() => setOpenForm((v) => !v)} className="btn-gold text-sm">＋ 枠を公開</button>
        </div>
      </div>

      {msg && (
        <p className="rounded-lg border border-(--color-line) bg-(--color-panel) px-3 py-2 text-xs">
          {msg} <button onClick={() => setMsg(null)} className="ml-2 text-(--color-dim)">✕</button>
        </p>
      )}

      {openForm && (
        <form action={(fd) => run(() => createSlots(fd))} className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
          <p className="mb-3 text-sm font-medium">レッスン枠の公開（開始〜終了をレッスン時間で分割して作成します）</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <select name="coach_staff_id" required className="input-dark" defaultValue="">
              <option value="" disabled>コーチ *</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input name="date" type="date" required className="input-dark" />
            <input name="start" type="time" required step={1800} className="input-dark" />
            <input name="end" type="time" required step={1800} className="input-dark" />
            <select name="minutes" defaultValue="60" className="input-dark">
              <option value="30">30分</option>
              <option value="60">60分</option>
              <option value="90">90分</option>
            </select>
            <select name="bay_id" defaultValue="" className="input-dark">
              <option value="">打席指定なし</option>
              {bays.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <input name="note" placeholder="メモ（例: 初心者向け）" className="input-dark flex-1" />
            <button disabled={pending} className="btn-gold whitespace-nowrap">{pending ? "作成中…" : "公開する"}</button>
          </div>
          <p className="mt-2 text-xs text-(--color-dim)">打席を指定すると、その時間帯は会員の打席予約から自動でブロックされます。</p>
        </form>
      )}

      {dates.length === 0 && (
        <p className="rounded-xl border border-dashed border-(--color-line) bg-(--color-panel) p-6 text-center text-sm text-(--color-dim)">
          公開中の枠がありません。「＋ 枠を公開」から作成してください。
        </p>
      )}

      {dates.map((d) => (
        <section key={d}>
          <h2 className="mb-2 text-sm font-semibold">{fmtDate(d)}</h2>
          <div className="space-y-2">
            {filtered
              .filter((s) => s.date === d)
              .map((s) => (
                <div key={s.id} className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{s.start}〜{s.end}</span>
                    <span>{s.coachName}</span>
                    {s.bayName && <span className="text-xs text-(--color-dim)">{s.bayName}</span>}
                    {s.note && <span className="text-xs text-(--color-dim)">{s.note}</span>}
                    {s.status === "closed" && <span className="rounded bg-white/10 px-2 py-0.5 text-xs">停止中</span>}
                    {s.booking ? (
                      <span className="rounded bg-(--color-header) px-2 py-0.5 text-xs text-white">
                        {s.booking.memberName}様（{s.booking.memberNo}）{s.booking.status === "done" ? "・実施済" : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-(--color-dim)">空き</span>
                    )}
                    <span className="ml-auto flex items-center gap-2">
                      {s.booking?.studentId && (
                        <Link href={`/students/${s.booking.studentId}`} className="btn-ghost text-xs">カルテ</Link>
                      )}
                      {s.booking && (
                        <button
                          onClick={() => setRecordFor(recordFor === s.id ? null : s.id)}
                          className="btn-ghost text-xs"
                        >
                          {s.booking.status === "done" ? "記録を編集" : "記録・申し送り"}
                        </button>
                      )}
                      {s.booking && s.booking.status === "confirmed" && (
                        <button
                          onClick={() => {
                            if (!confirm(`${s.booking!.memberName}様の予約をキャンセルしますか？`)) return;
                            const fd = new FormData();
                            fd.set("booking_id", s.booking!.id);
                            run(() => cancelLessonByStaff(fd));
                          }}
                          className="btn-ghost text-xs"
                        >
                          予約取消
                        </button>
                      )}
                      {!s.booking && (
                        <>
                          <button
                            onClick={() => {
                              const fd = new FormData();
                              fd.set("slot_id", s.id);
                              fd.set("op", s.status === "open" ? "close" : "open");
                              run(() => setSlotStatus(fd));
                            }}
                            className="btn-ghost text-xs"
                          >
                            {s.status === "open" ? "停止" : "再公開"}
                          </button>
                          <button
                            onClick={() => {
                              if (!confirm("この枠を削除しますか？")) return;
                              const fd = new FormData();
                              fd.set("slot_id", s.id);
                              fd.set("op", "delete");
                              run(() => setSlotStatus(fd));
                            }}
                            className="btn-ghost text-xs"
                          >
                            削除
                          </button>
                        </>
                      )}
                    </span>
                  </div>

                  {s.booking?.prevHandover && (
                    <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs">
                      <span className="font-semibold">前回からの申し送り: </span>
                      {s.booking.prevHandover}
                    </p>
                  )}

                  {s.booking && recordFor === s.id && (
                    <form
                      action={(fd) => run(() => saveLessonRecord(fd))}
                      className="mt-3 space-y-2 border-t border-(--color-line) pt-3"
                    >
                      <input type="hidden" name="booking_id" value={s.booking.id} />
                      <textarea
                        name="record_note"
                        defaultValue={s.booking.record ?? ""}
                        placeholder="今日のレッスン記録（内容・気づき）"
                        rows={3}
                        className="input-dark w-full"
                      />
                      <textarea
                        name="handover_note"
                        defaultValue={s.booking.handover ?? ""}
                        placeholder="次回への申し送り（次回の予約カードに自動表示されます）"
                        rows={2}
                        className="input-dark w-full"
                      />
                      <div className="flex items-center gap-3">
                        <button disabled={pending} className="btn-gold text-sm">{pending ? "保存中…" : "保存（実施済みにする）"}</button>
                        <span className="text-xs text-(--color-dim)">記入者: {actorName}</span>
                      </div>
                    </form>
                  )}
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
