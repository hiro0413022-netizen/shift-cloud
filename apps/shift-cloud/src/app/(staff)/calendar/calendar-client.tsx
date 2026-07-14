"use client";

import { useState, useTransition } from "react";
import type { MonthFeed } from "@/lib/day-feed";
import { dowJP, hm, fmtDateJP } from "@/lib/util";
import { saveMemo, toggleTask, addTask } from "./actions";
import { TASK_SOURCE_LABEL } from "@/lib/task-scope";

/**
 * 月間カレンダー（DECISIONS #48）
 * シフト・店舗イベント・本人メモ・タスク・（将来）予約を日別セルに表示。
 * 日タップで下に詳細パネルが開き、メモの書込みとタスク操作ができる。
 */
export function CalendarClient({ ym, today, feed }: { ym: string; today: string; feed: MonthFeed }) {
  const days = Object.keys(feed).sort();
  const [selected, setSelected] = useState<string>(days.includes(today) ? today : days[0]);
  const [memoDraft, setMemoDraft] = useState<string>(feed[selected]?.memo ?? "");
  const [taskDraft, setTaskDraft] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 週配置: 月初の曜日ぶん空セルを前置（TZ非依存でUTC算出 — lib/util dowJPと同思想）
  const [fy, fm, fd] = days[0].split("-").map(Number);
  const firstDow = new Date(Date.UTC(fy, fm - 1, fd)).getUTCDay();
  const cells: (string | null)[] = [...Array(firstDow).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const select = (d: string) => {
    setSelected(d);
    setMemoDraft(feed[d]?.memo ?? "");
    setMsg(null);
  };

  const day = feed[selected];

  return (
    <div className="space-y-4">
      {/* カレンダー本体 */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b border-zinc-100 bg-gradient-to-r from-brand-light to-white text-center text-[11px] font-medium">
          {["日", "月", "火", "水", "木", "金", "土"].map((w) => (
            <div key={w} className={`py-2 ${w === "日" ? "text-red-500" : w === "土" ? "text-blue-500" : "text-zinc-500"}`}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} className="min-h-16 border-b border-r border-zinc-50" />;
            const f = feed[d];
            const dow = dowJP(d);
            const isToday = d === today;
            const isSel = d === selected;
            const shift = f.shifts.find((s) => !s.is_day_off);
            const dayOff = f.shifts.some((s) => s.is_day_off);
            return (
              <button
                key={d}
                onClick={() => select(d)}
                className={`min-h-16 border-b border-r border-zinc-50 p-1 text-left align-top transition-colors ${
                  isSel ? "bg-brand-light" : "bg-white active:bg-zinc-50"
                }`}
              >
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                    isToday ? "bg-brand font-semibold text-white" : dow === "日" ? "text-red-500" : dow === "土" ? "text-blue-500" : "text-zinc-600"
                  }`}
                >
                  {Number(d.slice(8))}
                </span>
                {shift && (
                  <span
                    className="mt-0.5 block truncate rounded px-1 py-px text-[9px] font-medium text-white"
                    style={{ background: shift.template_color ?? "var(--color-brand)" }}
                  >
                    {hm(shift.start_time)}〜{hm(shift.end_time)}
                  </span>
                )}
                {dayOff && !shift && <span className="mt-0.5 block rounded bg-zinc-100 px-1 py-px text-center text-[9px] text-zinc-400">休</span>}
                <span className="mt-0.5 flex gap-0.5 px-0.5">
                  {f.events.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="イベント" />}
                  {f.reservations.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-sky-400" title="予約" />}
                  {f.tasks.some((t) => t.status === "open") && <span className="h-1.5 w-1.5 rounded-full bg-red-400" title="未完了タスク" />}
                  {f.memo && <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" title="メモ" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 border-t border-zinc-100 px-3 py-2 text-[10px] text-zinc-400">
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />イベント</span>
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />予約</span>
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-red-400" />やること</span>
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-zinc-400" />メモ</span>
        </div>
      </div>

      {/* 選択日の詳細 */}
      {day && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="font-semibold">{fmtDateJP(selected)}</p>

          <div className="mt-2 space-y-1 text-sm">
            {day.shifts.length === 0 && <p className="text-zinc-400">シフトなし</p>}
            {day.shifts.map((s, i) =>
              s.is_day_off ? (
                <p key={i} className="text-zinc-500">休み</p>
              ) : (
                <p key={i}>
                  <span className="font-medium">{hm(s.start_time)}〜{hm(s.end_time)}</span>
                  <span className="ml-2 text-xs text-zinc-400">{s.store_name}{s.template_name ? ` ・ ${s.template_name}` : ""}</span>
                </p>
              )
            )}
            {day.events.map((e, i) => (
              <p key={`ev${i}`} className="text-amber-600">📌 {e.title}{e.start_time ? ` ${hm(e.start_time)}` : ""}<span className="ml-1 text-xs text-zinc-400">{e.store_name}</span></p>
            ))}
            {day.reservations.map((r, i) => (
              <p key={`rv${i}`} className="text-sky-600">🎫 {r.label}</p>
            ))}
          </div>

          {/* やること */}
          <div className="mt-3 border-t border-zinc-100 pt-3">
            <p className="text-xs font-medium text-zinc-500">やること</p>
            <div className="mt-1.5 space-y-1.5">
              {day.tasks.map((t) => (
                <div key={t.id}>
                  <div className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={t.status === "done"}
                      onChange={() => startTransition(async () => { await toggleTask(t.id); })}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-(--color-brand)"
                    />
                    <span className={`min-w-0 flex-1 ${t.status === "done" ? "text-zinc-300 line-through" : ""}`}>{t.title}</span>
                    {TASK_SOURCE_LABEL[t.source] && (
                      <span className="shrink-0 rounded bg-brand-light px-1 text-[10px] text-brand">{TASK_SOURCE_LABEL[t.source]}</span>
                    )}
                    {/* 店舗共通タスク: 誰か1人が完了にすれば全員から消える */}
                    {!t.staff_id && <span className="shrink-0 rounded bg-zinc-100 px-1 text-[10px] text-zinc-500">店</span>}
                  </div>
                  {t.note && (
                    <pre className="mt-1 ml-6 whitespace-pre-wrap rounded bg-zinc-50 p-2 text-[12px] leading-relaxed text-zinc-600">{t.note}</pre>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  value={taskDraft}
                  onChange={(e) => setTaskDraft(e.target.value)}
                  placeholder="やることを追加"
                  className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                />
                <button
                  disabled={pending || !taskDraft.trim()}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await addTask(selected, taskDraft);
                      if (!r.error) setTaskDraft("");
                    })
                  }
                  className="rounded-md bg-brand px-3 py-1.5 text-sm text-white disabled:opacity-40"
                >
                  追加
                </button>
              </div>
            </div>
          </div>

          {/* メモ */}
          <div className="mt-3 border-t border-zinc-100 pt-3">
            <p className="text-xs font-medium text-zinc-500">メモ（自分だけに表示）</p>
            <textarea
              value={memoDraft}
              onChange={(e) => setMemoDraft(e.target.value)}
              rows={3}
              placeholder="この日のメモを書く"
              className="mt-1.5 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
            />
            <div className="mt-1.5 flex items-center gap-3">
              <button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await saveMemo(selected, memoDraft);
                    setMsg(r.error ? r.error : "保存しました");
                  })
                }
                className="rounded-md bg-brand px-4 py-1.5 text-sm text-white disabled:opacity-40"
              >
                {pending ? "保存中…" : "メモを保存"}
              </button>
              {msg && <span className="text-xs text-zinc-400">{msg}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
