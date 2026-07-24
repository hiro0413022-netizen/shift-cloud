"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dowJP, hm, fmtDateJP, addMonths } from "@/lib/util";
import type { KpiCard, StoreInfo, StoreLink, StoreMonthFeed } from "@/lib/store-dash";
import { toggleStoreTask, addStoreTask } from "./actions";

/**
 * 店舗ダッシュボード（店頭タブレット共有表示）
 * 上: 月間カレンダー（出勤者名チップ＋●） / 選択日詳細（出勤者・体験予約・店舗やること）
 * 中: 今月KPIカード4種
 * 下: 業務リンク集
 * 5分ごとに自動リフレッシュ（置きっぱなし運用）
 */
export function StoreDashClient({
  token,
  ym,
  today,
  store,
  stores,
  feed,
  kpis,
  links,
}: {
  token: string;
  ym: string;
  today: string;
  store: StoreInfo;
  stores: StoreInfo[];
  feed: StoreMonthFeed;
  kpis: KpiCard[];
  links: StoreLink[];
}) {
  const router = useRouter();
  const days = Object.keys(feed).sort();
  const [selected, setSelected] = useState<string>(days.includes(today) ? today : days[0]);
  const [taskDraft, setTaskDraft] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 置きっぱなしタブレット向け: 5分ごとに再取得
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [router]);

  const go = (params: { ym?: string; store?: string }) => {
    const q = new URLSearchParams();
    q.set("ym", params.ym ?? ym);
    q.set("store", params.store ?? store.id);
    router.push(`/store/${token}?${q.toString()}`);
  };

  // 週配置（(staff)/calendar と同方式・TZ非依存）
  const [fy, fm, fd] = days[0].split("-").map(Number);
  const firstDow = new Date(Date.UTC(fy, fm - 1, fd)).getUTCDay();
  const cells: (string | null)[] = [...Array(firstDow).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  const day = feed[selected];
  const shortName = (n: string) => n.replace(/[\s　].*$/, ""); // 姓のみ表示

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 pb-10">
      {/* ヘッダー: 店舗切替 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">店舗ダッシュボード</h1>
        <div className="flex rounded-xl border border-zinc-200 bg-white p-1 shadow-sm">
          {stores.map((s) => (
            <button
              key={s.id}
              onClick={() => go({ store: s.id })}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                s.id === store.id ? "bg-brand text-white" : "text-zinc-500 active:bg-zinc-50"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* KPIカード（今月） */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.title} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">{k.title}</p>
            <p className={`mt-1 text-2xl font-bold tracking-tight ${k.tone === "muted" ? "text-zinc-400" : ""}`}>{k.value}</p>
            <p className="mt-0.5 text-[11px] text-zinc-400">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* カレンダー */}
      <div className="flex items-center gap-3">
        <button onClick={() => go({ ym: addMonths(ym, -1) })} className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-zinc-500">←</button>
        <p className="text-lg font-semibold tracking-tight">{ym.replace("-", "年")}月</p>
        <button onClick={() => go({ ym: addMonths(ym, 1) })} className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-zinc-500">→</button>
        <span className="ml-auto text-xs text-zinc-400">{store.name}の出勤・予定</span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b border-zinc-100 bg-gradient-to-r from-brand-light to-white text-center text-[11px] font-medium">
          {["日", "月", "火", "水", "木", "金", "土"].map((w) => (
            <div key={w} className={`py-2 ${w === "日" ? "text-red-500" : w === "土" ? "text-blue-500" : "text-zinc-500"}`}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} className="min-h-20 border-b border-r border-zinc-50" />;
            const f = feed[d];
            const dow = dowJP(d);
            const isToday = d === today;
            const isSel = d === selected;
            const working = f.shifts.filter((s) => !s.is_day_off);
            return (
              <button
                key={d}
                onClick={() => { setSelected(d); setMsg(null); }}
                className={`min-h-20 border-b border-r border-zinc-50 p-1 text-left align-top transition-colors ${
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
                {/* 出勤者チップ（最大3名＋残数） */}
                <span className="mt-0.5 block space-y-px">
                  {working.slice(0, 3).map((s, j) => (
                    <span
                      key={j}
                      className="block truncate rounded px-1 py-px text-[9px] font-medium text-white"
                      style={{ background: s.template_color ?? "var(--color-brand)" }}
                    >
                      {shortName(s.staff_name)}
                    </span>
                  ))}
                  {working.length > 3 && <span className="block px-1 text-[9px] text-zinc-400">他{working.length - 3}名</span>}
                </span>
                <span className="mt-0.5 flex gap-0.5 px-0.5">
                  {f.events.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="イベント" />}
                  {f.reservations.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-sky-400" title="体験予約" />}
                  {f.tasks.some((t) => t.status === "open") && <span className="h-1.5 w-1.5 rounded-full bg-red-400" title="未完了タスク" />}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 border-t border-zinc-100 px-3 py-2 text-[10px] text-zinc-400">
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />イベント</span>
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />体験予約</span>
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-red-400" />やること</span>
        </div>
      </div>

      {/* 選択日の詳細 */}
      {day && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="font-semibold">{fmtDateJP(selected)}</p>

          {/* 出勤者 */}
          <div className="mt-2 space-y-1 text-sm">
            {day.shifts.filter((s) => !s.is_day_off).length === 0 && <p className="text-zinc-400">出勤予定なし</p>}
            {day.shifts.filter((s) => !s.is_day_off).map((s, i) => (
              <p key={i}>
                <span className="font-medium">{s.staff_name}</span>
                <span className="ml-2 text-xs text-zinc-400">{hm(s.start_time)}〜{hm(s.end_time)}</span>
              </p>
            ))}
            {day.events.map((e, i) => (
              <p key={`ev${i}`} className="text-amber-600">📌 {e.title}{e.start_time ? ` ${hm(e.start_time)}` : ""}</p>
            ))}
            {day.reservations.map((r, i) => (
              <p key={`rv${i}`} className="text-sky-600">🎫 {r.label}</p>
            ))}
          </div>

          {/* 店舗のやること */}
          <div className="mt-3 border-t border-zinc-100 pt-3">
            <p className="text-xs font-medium text-zinc-500">この日のやること（店舗共通）</p>
            <div className="mt-1.5 space-y-1.5">
              {day.tasks.map((t) => (
                <div key={t.id}>
                  <div className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={t.status === "done"}
                      onChange={() =>
                        startTransition(async () => {
                          const r = await toggleStoreTask(token, t.id);
                          if (r.error) setMsg(r.error);
                          router.refresh();
                        })
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 accent-(--color-brand)"
                    />
                    <span className={`min-w-0 flex-1 ${t.status === "done" ? "text-zinc-300 line-through" : ""}`}>{t.title}</span>
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
                  placeholder="やることを追加（店舗のみんなに表示）"
                  className="min-w-0 flex-1 rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
                />
                <button
                  disabled={pending || !taskDraft.trim()}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await addStoreTask(token, store.id, selected, taskDraft);
                      if (r.error) setMsg(r.error);
                      else setTaskDraft("");
                      router.refresh();
                    })
                  }
                  className="rounded-md bg-brand px-3 py-1.5 text-sm text-white disabled:opacity-40"
                >
                  追加
                </button>
              </div>
              {msg && <p className="text-xs text-red-500">{msg}</p>}
            </div>
          </div>
        </div>
      )}

      {/* 業務リンク集 */}
      <div>
        <p className="mb-2 text-xs font-medium text-zinc-500">業務システム</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {links.map((l) => (
            <a
              key={l.id}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-colors active:bg-zinc-50"
            >
              <p className="text-sm font-semibold">{l.label}</p>
              {l.note && <p className="mt-0.5 text-[11px] text-zinc-400">{l.note}</p>}
            </a>
          ))}
          {links.length === 0 && <p className="text-sm text-zinc-400">リンク未登録（sp_links）</p>}
        </div>
      </div>

      {/* 打刻キオスクへの導線（同じトークン） */}
      <div className="text-center">
        <a href={`/kiosk/${token}`} className="text-xs text-zinc-400 underline underline-offset-2">打刻画面（キオスク）へ</a>
      </div>
    </div>
  );
}
