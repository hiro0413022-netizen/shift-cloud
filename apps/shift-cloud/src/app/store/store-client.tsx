"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dowJP, hm, fmtDateJP, addMonths } from "@/lib/util";
import type { FittingBoard, KpiCard, StoreInfo, StoreLink, StoreMonthFeed } from "@/lib/store-dash";
import { toggleStoreTask, addStoreTask, reorderStoreStaff, logoutStore, markFittingArrived } from "./actions";

/**
 * 店舗ダッシュボード（店頭PC共有表示）
 * PC想定の2カラム: 左=シフト表グリッド（Airシフト風・スタッフ×日付の半月表示）/ 右=選択日詳細（出勤者・体験予約・店舗やること）
 * 上: 今月KPIカード4種 / 下: 業務リンク集
 * 5分ごとに自動リフレッシュ（置きっぱなし運用）。狭い画面では縦積みに落ちる
 *
 * 認証は2方式:
 *  - デバイストークン: basePath=`/store/<token>`, token=<token>, kioskToken=<token>
 *  - 店舗ログインCookie: basePath="/store", token=null, showLogout=true
 */
type StaffRow = { id: string | null; name: string; sort: number };
/** 行の識別子。スタッフ行はidで一意。id不明（削除済み等）のときだけ氏名で束ねる */
const rowKey = (r: StaffRow) => r.id ?? `name:${r.name}`;

export function StoreDashClient({
  basePath,
  token,
  kioskToken,
  showLogout,
  ym,
  half,
  today,
  store,
  stores,
  feed,
  kpis,
  links,
  fitting,
  reserveOsUrl,
}: {
  basePath: string;
  token: string | null;
  kioskToken: string | null;
  showLogout: boolean;
  ym: string;
  half: 1 | 2 | null; // URLの?h=（半月ページング）。null=今日の位置から自動
  today: string;
  store: StoreInfo;
  stores: StoreInfo[];
  feed: StoreMonthFeed;
  kpis: KpiCard[];
  links: StoreLink[];
  fitting: FittingBoard;
  reserveOsUrl: string;
}) {
  const router = useRouter();
  const days = Object.keys(feed).sort();
  const [selected, setSelected] = useState<string>(days.includes(today) ? today : days[0]);
  const [taskDraft, setTaskDraft] = useState("");
  // フィッティングの受付URL（「来店」を押すと発行される・#186）
  const [intake, setIntake] = useState<{ name: string; url: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // スタッフ行の並べ替え（#171）
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement | null>());
  const orderAtDragStart = useRef<string>("");

  // 置きっぱなしタブレット向け: 5分ごとに再取得
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [router]);

  const go = (params: { ym?: string; store?: string; h?: 1 | 2 }) => {
    const q = new URLSearchParams();
    q.set("ym", params.ym ?? ym);
    q.set("store", params.store ?? store.id);
    if (params.h) q.set("h", String(params.h));
    router.push(`${basePath}?${q.toString()}`);
  };

  // ===== シフト表グリッド（Airシフト風・#137） =====
  // 表示は半月単位（1〜15日 / 16〜末日）。指定が無ければ「今日」が入っている側を出す
  const curHalf: 1 | 2 = half ?? (today.slice(0, 7) === ym && Number(today.slice(8)) >= 16 ? 2 : 1);
  const gridDays = days.filter((d) => (curHalf === 1 ? Number(d.slice(8)) <= 15 : Number(d.slice(8)) >= 16));
  // 行=当月のシフト（出勤・休み）に登場するスタッフ。
  // 並びは staff.sort_order → 氏名（スタッフ管理の▲▼・紙シフト・シフト作成と同じ規則・#147）。
  // 以前は「その月に最初に出てきた順」で、月が変わると勝手に入れ替わっていた（#171）
  const serverRows = useMemo<StaffRow[]>(() => {
    const map = new Map<string, StaffRow>();
    for (const d of Object.keys(feed).sort()) {
      for (const s of feed[d].shifts) {
        const key = rowKey({ id: s.staff_id, name: s.staff_name, sort: s.staff_sort });
        if (!map.has(key)) map.set(key, { id: s.staff_id, name: s.staff_name, sort: s.staff_sort });
      }
    }
    return [...map.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ja"));
  }, [feed]);

  // ドラッグ中と保存待ちのあいだだけ、見た目を先に入れ替えておく（サーバーが追いついたら捨てる）
  const rows = useMemo<StaffRow[]>(() => {
    if (!draftOrder) return serverRows;
    const byKey = new Map(serverRows.map((r) => [rowKey(r), r]));
    const out = draftOrder.map((k) => byKey.get(k)).filter((r): r is StaffRow => !!r);
    for (const r of serverRows) if (!draftOrder.includes(rowKey(r))) out.push(r);
    return out;
  }, [serverRows, draftOrder]);

  useEffect(() => {
    if (!draftOrder) return;
    // サーバーの並びが追いついたら下書きを捨てる（以後はサーバーが正）
    if (serverRows.map(rowKey).join("\u0000") === draftOrder.join("\u0000")) setDraftOrder(null);
  }, [serverRows, draftOrder]);

  // 氏名しか分からない行（スタッフが削除済み等）が混ざっていると保存できない
  const canReorder = rows.length > 1 && rows.every((r) => r.id);

  const moveRow = (fromKey: string, toIndex: number) => {
    const keys = rows.map(rowKey);
    const from = keys.indexOf(fromKey);
    if (from < 0 || toIndex < 0 || toIndex >= keys.length || from === toIndex) return;
    const next = keys.slice();
    next.splice(toIndex, 0, next.splice(from, 1)[0]);
    setDraftOrder(next);
  };

  const onHandleDown = (e: React.PointerEvent<HTMLSpanElement>, key: string) => {
    if (!canReorder) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    orderAtDragStart.current = rows.map(rowKey).join("\u0000");
    setDragKey(key);
  };

  const onHandleMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!dragKey) return;
    const keys = rows.map(rowKey);
    for (let i = 0; i < keys.length; i += 1) {
      const el = rowRefs.current.get(keys[i]);
      if (!el) continue;
      const box = el.getBoundingClientRect();
      if (e.clientY >= box.top && e.clientY <= box.bottom) {
        moveRow(dragKey, i);
        break;
      }
    }
  };

  const onHandleUp = () => {
    if (!dragKey) return;
    setDragKey(null);
    const keys = rows.map(rowKey);
    if (keys.join("\u0000") === orderAtDragStart.current) return; // 動いていない＝保存しない
    const ids = rows.map((r) => r.id);
    if (ids.some((id) => !id)) {
      setMsg("並び順を保存できないスタッフが含まれています");
      setDraftOrder(null);
      return;
    }
    startTransition(async () => {
      const r = await reorderStoreStaff(token, store.id, ids as string[]);
      if (r.error) {
        setMsg(r.error);
        setDraftOrder(null);
      } else {
        setMsg(null);
      }
      router.refresh();
    });
  };
  // 半月の前後ページング（月をまたぐ）
  const goHalf = (dir: -1 | 1) => {
    if (dir === 1) {
      if (curHalf === 1) go({ h: 2 });
      else go({ ym: addMonths(ym, 1), h: 1 });
    } else {
      if (curHalf === 2) go({ h: 1 });
      else go({ ym: addMonths(ym, -1), h: 2 });
    }
  };

  const day = feed[selected];

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 pb-10 lg:p-6">
      {/* ヘッダー: 店舗切替 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">店舗ダッシュボード</h1>
        {/* 切替タブはオーナーのみ（stores が2件以上）。それ以外は自店舗名の表示だけ（#134・#128 店舗またぎ廃止） */}
        {stores.length > 1 ? (
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
        ) : (
          <span className="rounded-xl border border-zinc-200 bg-white px-4 py-1.5 text-sm font-medium text-zinc-600 shadow-sm">
            {store.name}
          </span>
        )}
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

      {/* フィッティング（未対応の申込 / 本日ご来店）— #186
          折り返し待ちを日付マスに埋めない。開いた瞬間に見える場所に置く */}
      {(fitting.pending.length > 0 || fitting.today.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {fitting.pending.length > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
              <p className="text-sm font-bold text-amber-900">
                折り返し待ちのフィッティング申込　{fitting.pending.length}件
              </p>
              <p className="mt-0.5 text-[11px] text-amber-700">
                お客様は日時を選べません。電話で日程を決めて、Reserve OSで「確定」を押すと受付台帳に入ります。
              </p>
              <ul className="mt-2 space-y-2">
                {fitting.pending.map((p) => (
                  <li key={p.requestId} className="rounded-xl bg-white p-3 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-zinc-800">{p.name} 様</span>
                      <span className="text-xs text-zinc-400">{p.seq}</span>
                      {p.waitingDays >= 1 && (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.waitingDays >= 2 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}>
                          {p.waitingDays}日経過
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-zinc-600">{p.serviceName}</p>
                    {p.prefs.map((v, i) => (
                      <p key={i} className="text-sm text-zinc-600">第{i + 1}希望 {v}</p>
                    ))}
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm">
                      {p.phone && <a href={`tel:${p.phone}`} className="font-medium text-brand underline">{p.phone}</a>}
                      <a href={`${reserveOsUrl}/requests/${p.requestId}`} target="_blank" rel="noreferrer" className="text-zinc-500 underline">
                        申込の詳細
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {fitting.today.length > 0 && (
            <div className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-bold text-zinc-800">本日のフィッティング　{fitting.today.length}件</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                「来店」を押すと受付台帳に打刻し、予約でいただいた内容が入った受付フォームが開きます。
              </p>
              <ul className="mt-2 space-y-2">
                {fitting.today.map((t) => (
                  <li key={t.visitId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-800">
                        {t.time && <span className="mr-2 text-sky-600">{t.time}</span>}
                        {t.name} 様
                      </p>
                      {t.note && <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500">{t.note}</p>}
                    </div>
                    {t.filled ? (
                      <span className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">記入済み ✓</span>
                    ) : (
                      <button
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const r = await markFittingArrived(token, t.visitId);
                            if (r.error) setMsg(r.error);
                            else if (r.url) setIntake({ name: t.name, url: r.url });
                            router.refresh();
                          })
                        }
                        className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 ${t.arrived ? "bg-zinc-400" : "bg-brand"}`}
                      >
                        {t.arrived ? "受付を開き直す" : "来店"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* シフト表グリッド＋選択日詳細（PCは2カラム・狭い画面は縦積み） */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={() => goHalf(-1)} className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-zinc-500">←</button>
        <p className="text-lg font-semibold tracking-tight">
          {ym.replace("-", "年")}月 <span className="text-sm font-medium text-zinc-500">{curHalf === 1 ? "前半（1〜15日）" : "後半（16日〜末日）"}</span>
        </p>
        <button onClick={() => goHalf(1)} className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-zinc-500">→</button>
        <span className="ml-auto text-xs text-zinc-400">{store.name}の出勤・予定</span>
        {/* 紙シフト（A4横）。いま見ている月・半月をそのまま持っていく（#172） */}
        <a
          href={`${basePath}/print?store=${store.id}&ym=${ym}&range=${curHalf === 1 ? "half1" : "half2"}`}
          className="whitespace-nowrap rounded-md border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm active:bg-zinc-50"
        >
          🖨 紙シフトを印刷
        </a>
      </div>

      {/* Airシフト風: 行=スタッフ / 列=日付 / セル=出勤時刻 or 休み（#137） */}
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-24 border-b border-r border-zinc-200 bg-zinc-50 px-2 py-2 text-left text-[11px] font-medium text-zinc-500">
                スタッフ
              </th>
              {gridDays.map((d) => {
                const dow = dowJP(d);
                const f = feed[d];
                const isToday = d === today;
                const isSel = d === selected;
                return (
                  <th key={d} className={`min-w-14 border-b border-r border-zinc-100 p-0 last:border-r-0 ${isSel ? "bg-brand-light" : "bg-zinc-50"}`}>
                    <button onClick={() => { setSelected(d); setMsg(null); }} className="w-full px-1 py-1.5 text-center">
                      <span
                        className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold ${
                          isToday ? "bg-brand text-white" : dow === "日" ? "text-red-500" : dow === "土" ? "text-blue-500" : "text-zinc-600"
                        }`}
                      >
                        {Number(d.slice(8))}
                      </span>
                      <span className={`block text-[10px] font-normal ${dow === "日" ? "text-red-400" : dow === "土" ? "text-blue-400" : "text-zinc-400"}`}>
                        （{dow}）
                      </span>
                      <span className="flex h-2 items-center justify-center gap-0.5">
                        {f.events.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="イベント" />}
                        {f.reservations.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-sky-400" title="体験予約" />}
                        {f.tasks.some((t) => t.status === "open") && <span className="h-1.5 w-1.5 rounded-full bg-red-400" title="未完了タスク" />}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={gridDays.length + 1} className="px-3 py-6 text-center text-zinc-400">
                  この月の確定シフトはまだありません
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const key = rowKey(row);
              const dragging = dragKey === key;
              return (
              <tr
                key={key}
                ref={(el) => { rowRefs.current.set(key, el); }}
                className={dragging ? "opacity-60" : ""}
              >
                <th className={`sticky left-0 z-10 whitespace-nowrap border-b border-r border-zinc-200 px-2 py-1.5 text-left text-xs font-semibold text-zinc-700 ${dragging ? "bg-brand-light" : "bg-white"}`}>
                  <span className="flex items-center gap-1">
                    {/* 並べ替えハンドル（#171）。マウスでもタッチでも動くようポインタイベントで実装 */}
                    <span
                      onPointerDown={(e) => onHandleDown(e, key)}
                      onPointerMove={onHandleMove}
                      onPointerUp={onHandleUp}
                      onPointerCancel={onHandleUp}
                      title={canReorder ? "ドラッグで並び替え" : "並び替えできません"}
                      aria-label="並び替え"
                      className={`-ml-0.5 select-none touch-none text-[13px] leading-none text-zinc-300 ${
                        canReorder ? "cursor-grab active:cursor-grabbing hover:text-zinc-500" : "opacity-30"
                      }`}
                    >
                      ⠿
                    </span>
                    {row.name}
                  </span>
                </th>
                {gridDays.map((d) => {
                  const cellShifts = feed[d].shifts.filter((s) =>
                    row.id ? s.staff_id === row.id : s.staff_name === row.name,
                  );
                  const isSel = d === selected;
                  return (
                    <td
                      key={d}
                      onClick={() => { setSelected(d); setMsg(null); }}
                      className={`cursor-pointer border-b border-r border-zinc-100 p-0.5 align-middle last:border-r-0 ${
                        isSel ? "bg-brand-light/60" : d === today ? "bg-amber-50/60" : ""
                      }`}
                    >
                      <span className="block space-y-0.5">
                        {cellShifts.map((s, j) =>
                          s.is_day_off ? (
                            <span key={j} className="block rounded bg-rose-500 px-0.5 py-1 text-center text-[10px] font-semibold text-white">
                              休み
                            </span>
                          ) : (
                            <span
                              key={j}
                              className="block rounded border border-sky-300 bg-sky-50 px-0.5 py-1 text-center text-[10px] font-semibold tabular-nums text-sky-700"
                            >
                              {hm(s.start_time)}-{hm(s.end_time)}
                            </span>
                          ),
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-3 border-t border-zinc-100 px-3 py-2 text-[10px] text-zinc-400">
          <span><span className="mr-1 inline-block rounded border border-sky-300 bg-sky-50 px-1 text-[9px] font-semibold text-sky-700">10:45-19:45</span>出勤（確定シフト）</span>
          <span><span className="mr-1 inline-block rounded bg-rose-500 px-1 text-[9px] font-semibold text-white">休み</span>休み</span>
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />イベント</span>
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />体験予約</span>
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-red-400" />やること</span>
          {canReorder && (
            <span className="ml-auto">
              <span className="mr-1 text-zinc-300">⠿</span>をドラッグでスタッフの並び替え（シフト作成・紙シフトにも反映）
            </span>
          )}
        </div>
      </div>
      {msg && <p className="text-xs text-red-500">{msg}</p>}
      </div>

      {/* 選択日の詳細（PCはカレンダー右に固定表示） */}
      {day && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:sticky lg:top-4">
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
      </div>

      {/* フィッティングの受付フォームを開く（#186） */}
      {intake && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <p className="text-lg font-semibold text-zinc-800">{intake.name} 様の受付</p>
            <p className="mt-2 text-sm text-zinc-500">
              予約でいただいたお名前・フリガナ・電話・メールは入力済みです。<br />
              ご住所など足りない欄とご署名だけお願いしてください。
            </p>
            <a
              href={intake.url}
              className="mt-5 block rounded-xl bg-brand py-4 text-center text-base font-semibold text-white"
            >
              この端末で受付フォームを開く
            </a>
            <p className="mt-3 break-all rounded-lg bg-zinc-50 p-2 text-[11px] text-zinc-500">
              別の端末で開く場合はこのURL（6時間有効）: {intake.url}
            </p>
            <button
              type="button"
              onClick={() => setIntake(null)}
              className="mt-3 w-full rounded-xl border border-zinc-200 py-3 text-sm font-medium text-zinc-500"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* 業務リンク集 */}
      <div>
        <p className="mb-2 text-xs font-medium text-zinc-500">業務システム</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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

      {/* フッター導線 */}
      <div className="flex items-center justify-center gap-4 text-center">
        {kioskToken && (
          <a href={`/kiosk/${kioskToken}`} className="text-xs text-zinc-400 underline underline-offset-2">打刻画面（キオスク）へ</a>
        )}
        {showLogout && (
          <form action={logoutStore}>
            <button className="text-xs text-zinc-400 underline underline-offset-2">ログアウト</button>
          </form>
        )}
      </div>
    </div>
  );
}
