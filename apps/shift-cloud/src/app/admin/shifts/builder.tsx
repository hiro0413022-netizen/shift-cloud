"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { saveShifts, publishShifts, publishCells, unpublishCells, type CellShift } from "./actions";
import { Button } from "@/components/ui";

type Template = { id: string; name: string; start_time: string | null; end_time: string | null; is_day_off: boolean; color: string };
type StaffRow = { id: string; name: string };
type WorkType = { id: string; name: string; color: string };
type Shift = { staff_id: string; date: string; template_id: string | null; schedule_type_id: string | null; status: string; start_time: string | null; end_time: string | null };
type Request = { staff_id: string; date: string; template_id: string | null; memo: string | null; start_time: string | null; end_time: string | null };
type Cell = { template_id: string | null; schedule_type_id: string | null; start_time: string | null; end_time: string | null; status: string };

const CUSTOM = "__custom__";
/** 業務区分は "wt:<schedule_type_id>" で表す（テンプレIDと混ざらないように） */
const WT_PREFIX = "wt:";

function tLabel(t: Template) {
  if (t.is_day_off) return "休み";
  if (t.start_time && t.end_time) return `${t.start_time.slice(0, 5)}-${t.end_time.slice(0, 5)}`;
  return t.name;
}
function reqLabel(r: Request, tmap: Map<string, Template>) {
  if (r.start_time && r.end_time) return `${r.start_time.slice(0, 5)}-${r.end_time.slice(0, 5)}`;
  if (r.template_id) { const t = tmap.get(r.template_id); return t ? tLabel(t) : "—"; }
  return "メモ";
}
/** "2026-09-03" → "9/3" */
function md(date: string) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
}

/** 希望を「開始/終了の時刻」に落とす。テンプレ希望でも時間に展開して微調整できるようにする */
function reqTimes(r: Request, tmap: Map<string, Template>): { start: string; end: string } | null {
  if (r.start_time && r.end_time) return { start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5) };
  if (r.template_id) {
    const t = tmap.get(r.template_id);
    if (t && !t.is_day_off && t.start_time && t.end_time) {
      return { start: t.start_time.slice(0, 5), end: t.end_time.slice(0, 5) };
    }
  }
  return null;
}

export function ShiftBuilder({
  storeId, days, rangeLabel, rangeShort, staff, templates, workTypes, allowedTypes, caddyDays, shifts, requests, timeOff,
}: {
  storeId: string;
  /** 表示する日付（日/週/半月/月。範囲は lib/shift-span.ts が決める・#135） */
  days: string[];
  /** 見出し用「2026年9月1日（火） 〜 9月15日（火）」 */
  rangeLabel: string;
  /** ボタン用の短いラベル「9月前半」など */
  rangeShort: string;
  staff: StaffRow[]; templates: Template[]; shifts: Shift[]; requests: Request[];
  /** 業務区分マスタ（キャディ / レッスン / 会議 …）。schedule_types */
  workTypes: WorkType[];
  /** staffId → 出してよい業務区分ID。行が無い人にはプルダウンを出さない（#147） */
  allowedTypes: Record<string, string[]>;
  /** "staffId|date" → Caddy OSで確定した派遣のゴルフ場名（自動表示・#147） */
  caddyDays: Record<string, string>;
  /** "staffId|date" → 休み希望（approved=承認済み / submitted=申請中） */
  timeOff: Record<string, { status: string; reason: string | null }>;
}) {
  const init: Record<string, Cell> = {};
  for (const s of shifts)
    init[`${s.staff_id}|${s.date}`] = {
      template_id: s.template_id, schedule_type_id: s.schedule_type_id,
      start_time: s.start_time, end_time: s.end_time, status: s.status,
    };

  const [grid, setGrid] = useState(init);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [restored, setRestored] = useState(false);
  const [pending, start] = useTransition();
  // 退避キーは「店舗」だけ。表示範囲（日/週/半月/月）や月を混ぜると、
  // 期間を切り替えたとたんに未保存のドラフトが行方不明になる（#135）。
  const lsKey = `shiftdraft:${storeId}`;
  const inRange = new Set(days);

  // 未保存編集の集合／最新のグリッドを、非同期処理の中からも参照できるようにする
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const gridRef = useRef(grid);
  gridRef.current = grid;

  // サーバー側の最新シフト（保存/確定/他者編集の結果）を grid へ同期。
  // 未保存(dirty)のセルだけは上書きせず保持 → リロード不要で反映される。
  const shiftsSig = JSON.stringify(shifts);
  useEffect(() => {
    const base: Record<string, Cell> = {};
    for (const s of shifts)
      base[`${s.staff_id}|${s.date}`] = {
        template_id: s.template_id, schedule_type_id: s.schedule_type_id,
        start_time: s.start_time, end_time: s.end_time, status: s.status,
      };
    setGrid((prev) => {
      const next: Record<string, Cell> = { ...base };
      for (const k of dirtyRef.current) if (prev[k]) next[k] = prev[k];
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftsSig]);

  const reqMap = new Map<string, Request>();
  for (const r of requests) reqMap.set(`${r.staff_id}|${r.date}`, r);
  const tmap = new Map(templates.map((t) => [t.id, t]));
  const wtMap = new Map(workTypes.map((w) => [w.id, w]));
  /** その人に出す業務区分だけを返す（#147） */
  const typesFor = (staffId: string) =>
    (allowedTypes[staffId] ?? []).map((id) => wtMap.get(id)).filter((w): w is WorkType => !!w);

  // ① 未保存の編集を localStorage から復元
  useEffect(() => {
    try {
      // #135以前は "shiftdraft:店舗:年月" だった。取りこぼさないよう拾って新キーへ寄せる
      const merged: Record<string, Cell> = {};
      const keys: string[] = [];
      const lsKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k === lsKey || k.startsWith(`${lsKey}:`))) lsKeys.push(k);
      }
      for (const k of lsKeys) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const saved = JSON.parse(raw) as { grid: Record<string, Cell>; dirty: string[] };
        for (const dk of saved.dirty ?? []) if (saved.grid?.[dk]) { merged[dk] = saved.grid[dk]; keys.push(dk); }
        if (k !== lsKey) localStorage.removeItem(k);
      }
      if (keys.length) {
        setGrid((p) => ({ ...p, ...merged }));
        setDirty(new Set(keys));
        setRestored(true);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lsKey]);

  // ① 変更のたびに localStorage へ退避
  useEffect(() => {
    if (dirty.size === 0) { localStorage.removeItem(lsKey); return; }
    const picked: Record<string, Cell> = {};
    for (const k of dirty) if (grid[k]) picked[k] = grid[k];
    try { localStorage.setItem(lsKey, JSON.stringify({ grid: picked, dirty: [...dirty] })); } catch { /* ignore */ }
  }, [grid, dirty, lsKey]);

  // ① 離脱前の警告
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty.size > 0) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  function markDirty(key: string) { setDirty((p) => new Set(p).add(key)); }

  function setTemplate(staffId: string, date: string, value: string) {
    const key = `${staffId}|${date}`;
    // 確定済みを空にするのは「確定解除」でしかできない。ここで消せてしまうと画面だけ空になりDBは確定のまま残る
    if (!value && grid[key]?.status === "published") {
      setMsg(`${md(date)} は確定済みです。「🔒 確定済み」を押して確定を解除してから消してください`);
      return;
    }
    setGrid((p) => {
      const cur = p[key];
      // 確定済みのマスを直しても確定のまま（保存時に本人へ変更通知が飛ぶ・#138）
      const status = cur?.status === "published" ? "published" : "draft";
      if (value === CUSTOM) {
        return { ...p, [key]: { template_id: null, schedule_type_id: null, start_time: cur?.start_time ?? "10:00", end_time: cur?.end_time ?? "19:00", status } };
      }
      // 業務区分（キャディ等）。時刻は持たせない＝終日その業務、という扱い
      if (value.startsWith(WT_PREFIX)) {
        return { ...p, [key]: { template_id: null, schedule_type_id: value.slice(WT_PREFIX.length), start_time: null, end_time: null, status } };
      }
      return { ...p, [key]: { template_id: value || null, schedule_type_id: null, start_time: null, end_time: null, status } };
    });
    markDirty(key);
  }
  function setCustomTime(staffId: string, date: string, which: "start" | "end", v: string) {
    const key = `${staffId}|${date}`;
    setGrid((p) => ({ ...p, [key]: { ...p[key], template_id: null, schedule_type_id: null, [which === "start" ? "start_time" : "end_time"]: v } as Cell }));
    markDirty(key);
  }

  /**
   * 提出された希望をそのセルに落とす（クリック1回）。
   * 落とした先は時刻の入力欄なので、そこから任意の時間へ打ち替えられる。
   */
  function applyRequest(staffId: string, date: string) {
    const key = `${staffId}|${date}`;
    const req = reqMap.get(key);
    if (!req) return;
    if (grid[key]?.status === "published") return; // 確定済みは希望で上書きしない（直すなら確定解除から）
    const times = reqTimes(req, tmap);
    if (!times) return;
    setGrid((p) => ({ ...p, [key]: { template_id: null, schedule_type_id: null, start_time: times.start, end_time: times.end, status: "draft" } }));
    markDirty(key);
  }

  /**
   * 空いているセルにだけ希望をまとめて反映（入力済み・確定済みは上書きしない）。
   * 対象は**画面に見えている期間だけ**。見えていない日を勝手に埋めない（#135）
   */
  function applyAllRequests() {
    const next: Record<string, Cell> = {};
    const keys: string[] = [];
    for (const r of requests) {
      if (!inRange.has(r.date)) continue; // 表示範囲外は触らない
      const key = `${r.staff_id}|${r.date}`;
      const cur = grid[key];
      if (cur?.status === "published") continue;
      if (cur?.template_id || cur?.schedule_type_id || cur?.start_time) continue; // 既に入っているものは尊重する
      const times = reqTimes(r, tmap);
      if (!times) continue;
      next[key] = { template_id: null, schedule_type_id: null, start_time: times.start, end_time: times.end, status: "draft" };
      keys.push(key);
    }
    if (keys.length === 0) { setMsg(`${rangeShort}に反映できる希望がありません（すでに入力済みです）`); return; }
    setGrid((p) => ({ ...p, ...next }));
    setDirty((p) => { const s = new Set(p); for (const k of keys) s.add(k); return s; });
    setMsg(`${rangeShort}に${keys.length}件の希望を反映しました（時間はこのあと自由に変えられます）`);
  }

  /** 未保存ぶんをサーバーへ。確定/確定解除の前にも必ず通す＝画面と食い違わない */
  async function persistDirty(): Promise<{ error?: string; changedPublished?: number } | undefined> {
    const snapshot = new Set(dirtyRef.current);
    if (snapshot.size === 0) return;
    const cells: CellShift[] = [...snapshot].map((key) => {
      const [staff_id, date] = key.split("|");
      const c = gridRef.current[key];
      return {
        staff_id, date,
        template_id: c?.template_id ?? null,
        schedule_type_id: c?.schedule_type_id ?? null,
        start_time: c?.start_time ?? null,
        end_time: c?.end_time ?? null,
      };
    });
    const res = await saveShifts(storeId, cells);
    if (res.error) return res;
    setDirty(new Set());
    localStorage.removeItem(lsKey);
    setRestored(false);
    return res;
  }

  const save = useCallback((silent = false) => {
    if (dirtyRef.current.size === 0) return;
    start(async () => {
      const res = await persistDirty();
      if (res?.error) { setMsg(res.error); return; }
      const changed = res?.changedPublished ?? 0;
      setMsg(
        (silent ? "自動保存しました ✓" : "保存しました ✓")
        + (changed ? `（確定済み${changed}件の変更を本人へ通知）` : ""),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, lsKey, start]);

  // ① 15秒ごとに自動保存
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const id = setInterval(() => { if (dirty.size > 0) saveRef.current(true); }, 15000);
    return () => clearInterval(id);
  }, [dirty]);

  /** 確定・通知の対象は**表示中の期間だけ**。押す前に何が起きるか分かるようにする（#135） */
  function publish() {
    if (!confirm(`${rangeLabel}（${days.length}日ぶん）の未確定シフトをすべて確定し、スタッフに通知します。\nこの範囲の外は変わりません。よろしいですか？`)) return;
    start(async () => {
      const saved = await persistDirty();
      if (saved?.error) { setMsg(saved.error); return; }
      const res = await publishShifts(storeId, days[0], days[days.length - 1]);
      setMsg(res.error ?? `${rangeShort}の${res.published}件のシフトを確定しました ✓`);
    });
  }

  /** 1マスだけ確定（#138）。あとから1日足した・この人だけ先に決まった、に効く */
  function publishOne(staffId: string, date: string) {
    const key = `${staffId}|${date}`;
    start(async () => {
      const saved = await persistDirty();
      if (saved?.error) { setMsg(saved.error); return; }
      const res = await publishCells(storeId, [{ staff_id: staffId, date }]);
      if (res.error) { setMsg(res.error); return; }
      setGrid((p) => (p[key] ? { ...p, [key]: { ...p[key], status: "published" } } : p));
      setMsg(`${md(date)} を確定しました ✓（本人へ通知）`);
    });
  }

  /** 1マスだけ確定解除して編集できるようにする（#138） */
  function unpublishOne(staffId: string, date: string) {
    const key = `${staffId}|${date}`;
    if (!confirm(`${md(date)} の確定を解除します。\nスタッフのシフト画面からいったん消え、本人に「調整中」と通知されます。よろしいですか？`)) return;
    start(async () => {
      const res = await unpublishCells(storeId, [{ staff_id: staffId, date }]);
      if (res.error) { setMsg(res.error); return; }
      setGrid((p) => (p[key] ? { ...p, [key]: { ...p[key], status: "draft" } } : p));
      setMsg(`${md(date)} の確定を解除しました（編集できます）`);
    });
  }

  const dow = ["日", "月", "火", "水", "木", "金", "土"];
  // 未保存だが今は画面に出ていないセル（期間を切り替えたあと）。保存対象には入るので件数だけ伝える
  const dirtyOutside = [...dirty].filter((k) => !inRange.has(k.split("|")[1])).length;
  const publishedInRange = days.reduce((n, d) => n + staff.filter((s) => grid[`${s.id}|${d}`]?.status === "published").length, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button onClick={() => save(false)} disabled={pending || dirty.size === 0}>
          {pending ? "処理中…" : `保存（${dirty.size}件）`}
        </Button>
        <Button variant="secondary" onClick={applyAllRequests} disabled={pending} title={`${rangeLabel}の空いているセルにだけ希望を入れます`}>
          希望を一括反映（{rangeShort}）
        </Button>
        <Button variant="secondary" onClick={publish} disabled={pending} title={`${rangeLabel}の未確定ぶんだけを確定します`}>
          {rangeShort}をまとめて確定・通知
        </Button>
        <span className="text-xs text-zinc-400">{rangeShort}の確定済み {publishedInRange}件</span>
        {dirty.size > 0 && <span className="text-xs text-amber-600">● 未保存の変更あり（15秒ごとに自動保存）</span>}
        {dirtyOutside > 0 && <span className="text-xs text-zinc-400">うち{dirtyOutside}件は表示範囲の外（保存すると一緒に反映されます）</span>}
        {restored && <span className="text-xs text-blue-600">前回の編集内容を復元しました</span>}
        {msg && <p className="text-sm font-medium text-brand">{msg}</p>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        {/* 列が少ない期間（日/週/半月）は横幅いっぱいに広げる＝横スクロールが要らない（#135） */}
        <table className={`text-xs ${days.length <= 16 ? "w-full" : ""}`}>
          <thead>
            <tr className="bg-gradient-to-r from-brand-light to-white">
              <th className="sticky left-0 z-10 min-w-28 border-b border-r border-zinc-200 bg-brand-light px-3 py-2 text-left font-semibold text-brand">スタッフ</th>
              {days.map((d, di) => {
                const w = dow[new Date(d + "T00:00:00Z").getUTCDay()];
                // 週表示は月をまたぐので、月初と先頭には「◯月」を出す
                const showMonth = di === 0 || d.slice(8) === "01";
                return (
                  <th key={d} className={`min-w-24 border-b border-zinc-200 px-1 py-2 font-medium ${w === "日" ? "text-red-500" : w === "土" ? "text-blue-500" : "text-zinc-500"}`}>
                    {showMonth && <span className="block text-[10px] font-normal text-zinc-400">{Number(d.slice(5, 7))}月</span>}
                    {d.slice(8)}<span className="block text-[10px]">（{w}）</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {staff.map((s, i) => (
              <tr key={s.id} className={i % 2 ? "bg-zinc-50/40" : ""}>
                <td className="sticky left-0 z-10 border-b border-r border-zinc-100 bg-inherit px-3 py-1 font-medium">{s.name}</td>
                {days.map((d) => {
                  const key = `${s.id}|${d}`;
                  const cell = grid[key];
                  const req = reqMap.get(key);
                  const t = cell?.template_id ? tmap.get(cell.template_id) : null;
                  const wt = cell?.schedule_type_id ? wtMap.get(cell.schedule_type_id) : null;
                  const isCustom = !cell?.template_id && !cell?.schedule_type_id && !!(cell?.start_time || cell?.end_time);
                  const filled = !!(cell?.template_id || cell?.schedule_type_id || (cell?.start_time && cell?.end_time));
                  const myTypes = typesFor(s.id);
                  const caddy = caddyDays[key];
                  const published = cell?.status === "published";
                  const off = timeOff[key];
                  const bg = off?.status === "approved" ? "bg-rose-50"
                    : published ? "bg-emerald-50/60"
                    : dirty.has(key) ? "bg-amber-50"
                    : off ? "bg-rose-50/40" : "";
                  return (
                    <td key={d} className={`border-b border-zinc-100 p-0.5 align-top ${bg}`}>
                      <select
                        value={
                          isCustom ? CUSTOM
                            : cell?.schedule_type_id ? `${WT_PREFIX}${cell.schedule_type_id}`
                            : cell?.template_id ?? ""
                        }
                        onChange={(e) => setTemplate(s.id, d, e.target.value)}
                        className="w-full cursor-pointer rounded border-0 bg-transparent px-1 py-1 text-[11px] focus:outline-none"
                        style={wt ? { color: wt.color, fontWeight: 600 } : t ? { color: t.color, fontWeight: 600 } : undefined}
                      >
                        <option value="">—</option>
                        {templates.map((tp) => (<option key={tp.id} value={tp.id}>{tLabel(tp)}</option>))}
                        <option value={CUSTOM}>⌚ 時間指定</option>
                        {myTypes.length > 0 && (
                          <optgroup label="業務">
                            {myTypes.map((w) => (
                              <option key={w.id} value={`${WT_PREFIX}${w.id}`}>{w.name}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      {isCustom && (
                        <div className="flex items-center gap-0.5 px-0.5 pb-0.5">
                          <input type="time" value={cell?.start_time ?? ""} onChange={(e) => setCustomTime(s.id, d, "start", e.target.value)}
                            className="w-full rounded border border-zinc-200 px-0.5 py-0.5 text-[10px]" />
                          <span className="text-[9px] text-zinc-400">〜</span>
                          <input type="time" value={cell?.end_time ?? ""} onChange={(e) => setCustomTime(s.id, d, "end", e.target.value)}
                            className="w-full rounded border border-zinc-200 px-0.5 py-0.5 text-[10px]" />
                        </div>
                      )}

                      {/* 1マスごとの確定 / 確定解除（#138）。まとめ確定を待たずにここだけ決められる */}
                      {filled && (
                        published ? (
                          <button type="button" disabled={pending} onClick={() => unpublishOne(s.id, d)}
                            className="w-full rounded px-1 py-0.5 text-left text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                            title="確定済み。クリックすると確定を解除して編集できます（本人へ通知）">
                            🔒 確定済み
                          </button>
                        ) : (
                          <button type="button" disabled={pending} onClick={() => publishOne(s.id, d)}
                            className="w-full rounded px-1 py-0.5 text-left text-[10px] text-zinc-400 hover:bg-brand-light hover:text-brand disabled:opacity-50"
                            title="この日だけ確定して本人に通知します（未保存の変更もまとめて保存されます）">
                            ✓ この日を確定
                          </button>
                        )
                      )}

                      {/* Caddy OS で確定した派遣。ここでは入力させず「その日は外に出ている」と分かるだけ（#147） */}
                      {caddy && (
                        <p className="truncate px-1 pb-0.5 text-[10px] font-medium text-amber-700"
                          title={`Caddy OSで確定済みのキャディ派遣: ${caddy}`}>
                          ⛳ {caddy}
                        </p>
                      )}

                      {off && (
                        <p className={`truncate px-1 pb-0.5 text-[10px] font-medium ${off.status === "approved" ? "text-rose-600" : "text-rose-400"}`}
                          title={`${off.status === "approved" ? "承認済みの休み" : "休み希望（未処理）"}${off.reason ? `: ${off.reason}` : ""}`}>
                          {off.status === "approved" ? "🛌 休み確定" : "🛌 休み希望"}
                        </p>
                      )}
                      {req && (
                        reqTimes(req, tmap) ? (
                          <button type="button" onClick={() => applyRequest(s.id, d)}
                            className="w-full truncate rounded px-1 pb-0.5 text-left text-[10px] text-zinc-400 hover:bg-brand-light hover:text-brand"
                            title={`クリックでこの希望を反映（あとから時間を変えられます）\n希望: ${reqLabel(req, tmap)}${req.memo ? ` / ${req.memo}` : ""}`}>
                            希望: {reqLabel(req, tmap)}{req.memo ? " 📝" : ""}
                          </button>
                        ) : (
                          <p className="truncate px-1 pb-0.5 text-[10px] text-zinc-400"
                            title={`希望: ${reqLabel(req, tmap)}${req.memo ? ` / ${req.memo}` : ""}`}>
                            希望: {reqLabel(req, tmap)}{req.memo ? " 📝" : ""}
                          </p>
                        )
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        緑=確定済み / 黄=未保存 / 桃=休み希望。「⌚ 時間指定」で任意の時間を入力できます。
        <span className="font-medium text-zinc-500">「✓ この日を確定」で1日だけ確定</span>、
        <span className="font-medium text-zinc-500">「🔒 確定済み」を押すと確定を解除して直せます</span>（どちらも本人へ通知）。
        確定済みのままセルを直して保存した場合も、変更内容が本人へ通知されます。
        セル下の「希望」はスタッフの提出内容で、クリックするとその時間が入ります。
      </p>
    </div>
  );
}
