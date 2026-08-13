"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { saveDraft, publishShifts, type CellShift } from "./actions";
import { Button } from "@/components/ui";

type Template = { id: string; name: string; start_time: string | null; end_time: string | null; is_day_off: boolean; color: string };
type StaffRow = { id: string; name: string };
type Shift = { staff_id: string; date: string; template_id: string | null; status: string; start_time: string | null; end_time: string | null };
type Request = { staff_id: string; date: string; template_id: string | null; memo: string | null; start_time: string | null; end_time: string | null };
type Cell = { template_id: string | null; start_time: string | null; end_time: string | null; status: string };

const CUSTOM = "__custom__";

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
  storeId, days, rangeLabel, rangeShort, staff, templates, shifts, requests, timeOff,
}: {
  storeId: string;
  /** 表示する日付（日/週/半月/月。範囲は lib/shift-span.ts が決める・#135） */
  days: string[];
  /** 見出し用「2026年9月1日（火） 〜 9月15日（火）」 */
  rangeLabel: string;
  /** ボタン用の短いラベル「9月前半」など */
  rangeShort: string;
  staff: StaffRow[]; templates: Template[]; shifts: Shift[]; requests: Request[];
  /** "staffId|date" → 休み希望（approved=承認済み / submitted=申請中） */
  timeOff: Record<string, { status: string; reason: string | null }>;
}) {
  const init: Record<string, Cell> = {};
  for (const s of shifts) init[`${s.staff_id}|${s.date}`] = { template_id: s.template_id, start_time: s.start_time, end_time: s.end_time, status: s.status };

  const [grid, setGrid] = useState(init);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [restored, setRestored] = useState(false);
  const [pending, start] = useTransition();
  // 退避キーは「店舗」だけ。表示範囲（日/週/半月/月）や月を混ぜると、
  // 期間を切り替えたとたんに未保存のドラフトが行方不明になる（#135）。
  // セルは "staffId|date" で持っているので、範囲外の未保存ぶんもそのまま保存できる。
  const lsKey = `shiftdraft:${storeId}`;
  const inRange = new Set(days);

  // 未保存編集の集合を常に最新で参照できるようにする
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // サーバー側の最新シフト（保存/確定/他者編集の結果）を grid へ同期。
  // 未保存(dirty)のセルだけは上書きせず保持 → リロード不要で反映される。
  const shiftsSig = JSON.stringify(shifts);
  useEffect(() => {
    const base: Record<string, Cell> = {};
    for (const s of shifts) base[`${s.staff_id}|${s.date}`] = { template_id: s.template_id, start_time: s.start_time, end_time: s.end_time, status: s.status };
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
    setGrid((p) => {
      const cur = p[key];
      if (value === CUSTOM) {
        return { ...p, [key]: { template_id: null, start_time: cur?.start_time ?? "10:00", end_time: cur?.end_time ?? "19:00", status: "draft" } };
      }
      return { ...p, [key]: { template_id: value || null, start_time: null, end_time: null, status: "draft" } };
    });
    markDirty(key);
  }
  function setCustomTime(staffId: string, date: string, which: "start" | "end", v: string) {
    const key = `${staffId}|${date}`;
    setGrid((p) => ({ ...p, [key]: { ...p[key], template_id: null, [which === "start" ? "start_time" : "end_time"]: v, status: "draft" } as Cell }));
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
    if (grid[key]?.status === "published") return; // 確定済みは触らない
    const times = reqTimes(req, tmap);
    if (!times) return;
    setGrid((p) => ({ ...p, [key]: { template_id: null, start_time: times.start, end_time: times.end, status: "draft" } }));
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
      if (cur?.template_id || cur?.start_time) continue; // 既に入っているものは尊重する
      const times = reqTimes(r, tmap);
      if (!times) continue;
      next[key] = { template_id: null, start_time: times.start, end_time: times.end, status: "draft" };
      keys.push(key);
    }
    if (keys.length === 0) { setMsg(`${rangeShort}に反映できる希望がありません（すでに入力済みです）`); return; }
    setGrid((p) => ({ ...p, ...next }));
    setDirty((p) => { const s = new Set(p); for (const k of keys) s.add(k); return s; });
    setMsg(`${rangeShort}に${keys.length}件の希望を反映しました（時間はこのあと自由に変えられます）`);
  }

  const save = useCallback((silent = false) => {
    const snapshot = dirty;
    if (snapshot.size === 0) return;
    const cells: CellShift[] = [...snapshot].map((key) => {
      const [staff_id, date] = key.split("|");
      const c = grid[key];
      return { staff_id, date, template_id: c?.template_id ?? null, start_time: c?.start_time ?? null, end_time: c?.end_time ?? null };
    });
    start(async () => {
      const res = await saveDraft(storeId, cells);
      if (res.error) { setMsg(res.error); return; }
      setDirty(new Set());
      localStorage.removeItem(lsKey);
      setRestored(false);
      setMsg(silent ? "自動保存しました ✓" : "ドラフト保存しました ✓");
    });
  }, [dirty, grid, storeId, lsKey, start]);

  // ① 15秒ごとに自動保存
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const id = setInterval(() => { if (dirty.size > 0) saveRef.current(true); }, 15000);
    return () => clearInterval(id);
  }, [dirty]);

  /** 確定・通知の対象は**表示中の期間だけ**。押す前に何が起きるか分かるようにする（#135） */
  function publish() {
    if (!confirm(`${rangeLabel}（${days.length}日ぶん）のドラフトをすべて確定し、スタッフに通知します。\nこの範囲の外は変わりません。よろしいですか？`)) return;
    start(async () => {
      const res = await publishShifts(storeId, days[0], days[days.length - 1]);
      setMsg(res.error ?? `${rangeShort}の${res.published}件のシフトを確定しました ✓`);
    });
  }

  const dow = ["日", "月", "火", "水", "木", "金", "土"];
  // 未保存だが今は画面に出ていないセル（期間を切り替えたあと）。保存対象には入るので件数だけ伝える
  const dirtyOutside = [...dirty].filter((k) => !inRange.has(k.split("|")[1])).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button onClick={() => save(false)} disabled={pending || dirty.size === 0}>
          {pending ? "処理中…" : `ドラフト保存（${dirty.size}件）`}
        </Button>
        <Button variant="secondary" onClick={applyAllRequests} disabled={pending} title={`${rangeLabel}の空いているセルにだけ希望を入れます`}>
          希望を一括反映（{rangeShort}）
        </Button>
        <Button variant="secondary" onClick={publish} disabled={pending} title={`${rangeLabel}のドラフトだけを確定します`}>
          {rangeShort}のドラフトを確定・通知
        </Button>
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
                  const isCustom = !cell?.template_id && !!(cell?.start_time || cell?.end_time);
                  const off = timeOff[key];
                  const bg = off?.status === "approved" ? "bg-rose-50"
                    : cell?.status === "published" ? "bg-emerald-50/60"
                    : dirty.has(key) ? "bg-amber-50"
                    : off ? "bg-rose-50/40" : "";
                  return (
                    <td key={d} className={`border-b border-zinc-100 p-0.5 align-top ${bg}`}>
                      <select
                        value={isCustom ? CUSTOM : cell?.template_id ?? ""}
                        onChange={(e) => setTemplate(s.id, d, e.target.value)}
                        className="w-full cursor-pointer rounded border-0 bg-transparent px-1 py-1 text-[11px] focus:outline-none"
                        style={t ? { color: t.color, fontWeight: 600 } : undefined}
                      >
                        <option value="">—</option>
                        {templates.map((tp) => (<option key={tp.id} value={tp.id}>{tLabel(tp)}</option>))}
                        <option value={CUSTOM}>⌚ 時間指定</option>
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
        セル下の「希望」はスタッフの提出内容で、<span className="font-medium text-zinc-500">クリックするとその時間が入り、そこから自由に打ち替えられます</span>（📝=メモ、ホバーで表示）。
      </p>
    </div>
  );
}
