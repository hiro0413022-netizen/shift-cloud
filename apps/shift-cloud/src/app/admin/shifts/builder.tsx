"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { saveShifts, publishShifts, publishCells, unpublishCells, type CellShift } from "./actions";
import { Button } from "@/components/ui";
import { staffPeriodHours, formatWorkHours, type StaffHours } from "@/lib/shift-hours";

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
  storeId, today, days, rangeLabel, rangeShort, staff, templates, workTypes, allowedTypes, caddyDays, shifts, requests, timeOff,
}: {
  storeId: string;
  /** JSTの今日（日ごとリストで今日を目立たせる・スクロール先） */
  today: string;
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
  // 表示方法。calendar = 店舗ダッシュボードと同じシフト表（既定・#252）／ list = 日ごとのリスト
  const [view, setView] = useState<"calendar" | "list">("calendar");
  // カレンダーで選んだマス（右のパネル／スマホは下から出るパネルで編集する）
  const [sel, setSel] = useState<{ staffId: string; date: string } | null>(null);
  // 日ごとリストで「入っている人だけ」を出す（見るとき用）
  const [onlyFilled, setOnlyFilled] = useState(false);
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

  // 日ごとリストは縦に長いので、今日が範囲内なら今日の位置まで送る
  useEffect(() => {
    if (view !== "list" || typeof window === "undefined") return;
    if (days.length <= 1 || !days.includes(today) || days[0] === today) return;
    document.getElementById(`shift-day-${today}`)?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.join(","), today, view]);

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

  /**
   * 1マス（スタッフ×日）の中身。表（PC）と日ごとリスト（スマホ）で同じものを使う。
   * size="lg" はスマホ用＝文字とタップ領域を大きくする。
   */
  function renderCell(s: StaffRow, d: string, size: "sm" | "lg" = "sm") {
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
                      const lg = size === "lg";
    const body = (
      <>
                      <select
                        value={
                          isCustom ? CUSTOM
                            : cell?.schedule_type_id ? `${WT_PREFIX}${cell.schedule_type_id}`
                            : cell?.template_id ?? ""
                        }
                        onChange={(e) => setTemplate(s.id, d, e.target.value)}
                        className={lg
                          ? "w-full cursor-pointer rounded-lg border border-zinc-200 bg-white px-2 py-2 text-sm focus:border-brand focus:outline-none"
                          : "w-full cursor-pointer rounded border-0 bg-transparent px-1 py-1 text-[11px] focus:outline-none"}
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
                        <div className={lg ? "mt-1 flex items-center gap-1" : "flex items-center gap-0.5 px-0.5 pb-0.5"}>
                          <input type="time" value={cell?.start_time ?? ""} onChange={(e) => setCustomTime(s.id, d, "start", e.target.value)}
                            className={lg ? "w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm" : "w-full rounded border border-zinc-200 px-0.5 py-0.5 text-[10px]"} />
                          <span className={lg ? "text-xs text-zinc-400" : "text-[9px] text-zinc-400"}>〜</span>
                          <input type="time" value={cell?.end_time ?? ""} onChange={(e) => setCustomTime(s.id, d, "end", e.target.value)}
                            className={lg ? "w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm" : "w-full rounded border border-zinc-200 px-0.5 py-0.5 text-[10px]"} />
                        </div>
                      )}

                      {/* 1マスごとの確定 / 確定解除（#138）。まとめ確定を待たずにここだけ決められる */}
                      {filled && (
                        published ? (
                          <button type="button" disabled={pending} onClick={() => unpublishOne(s.id, d)}
                            className={`w-full rounded px-1 text-left font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 ${lg ? "py-1.5 text-xs" : "py-0.5 text-[10px]"}`}
                            title="確定済み。クリックすると確定を解除して編集できます（本人へ通知）">
                            🔒 確定済み
                          </button>
                        ) : (
                          <button type="button" disabled={pending} onClick={() => publishOne(s.id, d)}
                            className={`w-full rounded px-1 text-left text-zinc-400 hover:bg-brand-light hover:text-brand disabled:opacity-50 ${lg ? "py-1.5 text-xs" : "py-0.5 text-[10px]"}`}
                            title="この日だけ確定して本人に通知します（未保存の変更もまとめて保存されます）">
                            ✓ この日を確定
                          </button>
                        )
                      )}

                      {/* Caddy OS で確定した派遣。ここでは入力させず「その日は外に出ている」と分かるだけ（#147） */}
                      {caddy && (
                        <p className={`truncate px-1 pb-0.5 font-medium text-amber-700 ${lg ? "text-xs" : "text-[10px]"}`}
                          title={`Caddy OSで確定済みのキャディ派遣: ${caddy}`}>
                          ⛳ {caddy}
                        </p>
                      )}

                      {off && (
                        <p className={`truncate px-1 pb-0.5 font-medium ${lg ? "text-xs" : "text-[10px]"} ${off.status === "approved" ? "text-rose-600" : "text-rose-400"}`}
                          title={`${off.status === "approved" ? "承認済みの休み" : "休み希望（未処理）"}${off.reason ? `: ${off.reason}` : ""}`}>
                          {off.status === "approved" ? "🛌 休み確定" : "🛌 休み希望"}
                        </p>
                      )}
                      {req && (
                        reqTimes(req, tmap) ? (
                          <button type="button" onClick={() => applyRequest(s.id, d)}
                            className={`w-full truncate rounded px-1 text-left text-zinc-400 hover:bg-brand-light hover:text-brand ${lg ? "py-1 text-xs" : "pb-0.5 text-[10px]"}`}
                            title={`クリックでこの希望を反映（あとから時間を変えられます）\n希望: ${reqLabel(req, tmap)}${req.memo ? ` / ${req.memo}` : ""}`}>
                            希望: {reqLabel(req, tmap)}{req.memo ? " 📝" : ""}
                          </button>
                        ) : (
                          <p className={`truncate px-1 pb-0.5 text-zinc-400 ${lg ? "text-xs" : "text-[10px]"}`}
                            title={`希望: ${reqLabel(req, tmap)}${req.memo ? ` / ${req.memo}` : ""}`}>
                            希望: {reqLabel(req, tmap)}{req.memo ? " 📝" : ""}
                          </p>
                        )
                      )}
      </>
    );
    // 出勤している（休みテンプレ以外が入っている）か。日ごとリストの「出勤◯人」に使う
    const working = filled && !t?.is_day_off;
    return { bg, body, filled, published, working };
  }

  const dow = ["日", "月", "火", "水", "木", "金", "土"];
  // 未保存だが今は画面に出ていないセル（期間を切り替えたあと）。保存対象には入るので件数だけ伝える
  const dirtyOutside = [...dirty].filter((k) => !inRange.has(k.split("|")[1])).length;
  const publishedInRange = days.reduce((n, d) => n + staff.filter((s) => grid[`${s.id}|${d}`]?.status === "published").length, 0);

  // 人ごとの総労働時間（表示中の期間・確定＋下書き＋未保存・休憩控除後）。名前の横に出す（#255）
  const hoursBy = new Map<string, StaffHours>(staff.map((s) => [s.id, staffPeriodHours(s.id, days, grid, tmap)]));
  function hoursTitle(s: StaffRow): string {
    const h = hoursBy.get(s.id);
    if (!h) return "";
    return [
      `${rangeShort}の予定: ${formatWorkHours(h.minutes)}（出勤${h.workDays}日・休憩を引いた時間）`,
      h.draftMinutes > 0 ? `うち下書き ${formatWorkHours(h.draftMinutes)}` : "すべて確定済み",
      h.dutyDays > 0 ? `ほかに時間の無い業務 ${h.dutyDays}日（時間には入れていません）` : "",
    ].filter(Boolean).join("\n");
  }
  /** 名前の下に出す小さな1行 */
  function hoursBadge(s: StaffRow, size: "sm" | "lg" = "sm") {
    const h = hoursBy.get(s.id);
    if (!h || (h.minutes === 0 && h.dutyDays === 0)) {
      return <span className={`block font-normal text-zinc-300 ${size === "lg" ? "text-[11px]" : "text-[10px]"}`}>0h</span>;
    }
    const hasDraft = h.draftMinutes > 0;
    return (
      <span title={hoursTitle(s)}
        className={`block font-normal tabular-nums ${size === "lg" ? "text-[11px]" : "text-[10px]"} ${hasDraft ? "text-sky-600" : "text-emerald-700"}`}>
        計 <span className="font-semibold">{formatWorkHours(h.minutes)}</span>
        <span className="text-zinc-400">・{h.workDays}日{h.dutyDays > 0 ? `+業務${h.dutyDays}` : ""}</span>
      </span>
    );
  }

  // ===== カレンダー（店舗ダッシュボードのシフト表と同じ見た目・#252） =====
  /** マスに出すチップの中身。確定=濃い色／下書き=点線（ダッシュボードと同じ決まり） */
  function chipFor(s: StaffRow, d: string) {
    const key = `${s.id}|${d}`;
    const c = grid[key];
    if (!c) return null;
    const draft = c.status !== "published";
    if (c.schedule_type_id) {
      const w = wtMap.get(c.schedule_type_id);
      return { kind: "work" as const, label: w?.name ?? "業務", color: w?.color ?? "#71717a", draft };
    }
    if (c.template_id) {
      const t = tmap.get(c.template_id);
      if (!t) return { kind: "time" as const, start: "", end: "", label: "?", draft };
      if (t.is_day_off) return { kind: "off" as const, draft };
      if (t.start_time && t.end_time) return { kind: "time" as const, start: t.start_time.slice(0, 5), end: t.end_time.slice(0, 5), label: t.name, draft };
      return { kind: "work" as const, label: t.name, color: t.color, draft };
    }
    if (c.start_time || c.end_time) {
      return { kind: "time" as const, start: (c.start_time ?? "").slice(0, 5), end: (c.end_time ?? "").slice(0, 5), label: "時間指定", draft };
    }
    return null;
  }

  function renderChip(s: StaffRow, d: string) {
    const ch = chipFor(s, d);
    if (!ch) return null;
    if (ch.kind === "off") {
      return (
        <span className={ch.draft
          ? "block rounded border border-dashed border-rose-300 bg-rose-50 px-0.5 py-1 text-center text-[10px] font-semibold text-rose-400"
          : "block rounded bg-rose-500 px-0.5 py-1 text-center text-[10px] font-semibold text-white"}>
          休み
        </span>
      );
    }
    if (ch.kind === "work") {
      return (
        <span
          className={`block truncate rounded px-0.5 py-1 text-center text-[10px] font-semibold ${ch.draft ? "border border-dashed bg-white" : "text-white"}`}
          style={ch.draft ? { borderColor: ch.color, color: ch.color } : { backgroundColor: ch.color }}
        >
          {ch.label}
        </span>
      );
    }
    return (
      <span className={ch.draft
        ? "block rounded border border-dashed border-sky-300 bg-white px-0.5 py-0.5 text-center text-[10px] font-semibold leading-tight tabular-nums text-sky-500"
        : "block rounded border border-sky-300 bg-sky-50 px-0.5 py-0.5 text-center text-[10px] font-semibold leading-tight tabular-nums text-sky-700"}>
        <span className="block">{ch.start || "--:--"}</span>
        <span className="block">{ch.end || "--:--"}</span>
      </span>
    );
  }

  const selKey = sel ? `${sel.staffId}|${sel.date}` : null;
  const selStaff = sel ? staff.find((x) => x.id === sel.staffId) ?? null : null;

  /** パネルの前後移動（同じ人の前の日／次の日） */
  function moveSel(delta: number) {
    if (!sel) return;
    const i = days.indexOf(sel.date);
    const j = i + delta;
    if (j < 0 || j >= days.length) return;
    setSel({ staffId: sel.staffId, date: days[j] });
  }

  /** 選んだマスの編集パネル（PCは右に固定・スマホは下から出す） */
  function editor() {
    if (!sel || !selStaff || !selKey) {
      return (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-400">
          表のマスを押すと、ここでシフトを入れられます。
          <p className="mt-2 text-xs leading-relaxed">
            確定は濃い色、下書きは点線です。「{rangeShort}をまとめて確定・通知」で表示中の期間を一度に確定できます。
          </p>
        </div>
      );
    }
    const s = selStaff;
    const d = sel.date;
    const c = grid[selKey];
    const req = reqMap.get(selKey);
    const off = timeOff[selKey];
    const caddy = caddyDays[selKey];
    const published = c?.status === "published";
    const filled = !!(c?.template_id || c?.schedule_type_id || (c?.start_time && c?.end_time));
    const isCustom = !!c && !c.template_id && !c.schedule_type_id && !!(c.start_time || c.end_time);
    const myTypes = typesFor(s.id);
    const w = dow[new Date(d + "T00:00:00Z").getUTCDay()];
    const idx = days.indexOf(d);
    const opt = (active: boolean) =>
      `rounded-lg border px-2 py-2 text-sm font-semibold transition-colors ${active ? "border-brand bg-brand text-white" : "border-zinc-200 bg-white text-zinc-700 active:bg-zinc-50"}`;

    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{s.name}</p>
            <p className="text-xs text-zinc-500" title={hoursTitle(s)}>
              {rangeShort}の予定 <span className="font-semibold tabular-nums text-zinc-700">{formatWorkHours(hoursBy.get(s.id)?.minutes ?? 0)}</span>
              （{hoursBy.get(s.id)?.workDays ?? 0}日
              {(hoursBy.get(s.id)?.draftMinutes ?? 0) > 0 ? `・うち下書き ${formatWorkHours(hoursBy.get(s.id)?.draftMinutes ?? 0)}` : ""}）
            </p>
            <p className={`text-sm ${w === "日" ? "text-red-500" : w === "土" ? "text-blue-500" : "text-zinc-500"}`}>
              {md(d)}（{w}）
              {published
                ? <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">確定済み</span>
                : filled ? <span className="ml-2 rounded border border-dashed border-zinc-300 px-1.5 py-0.5 text-[11px] text-zinc-500">下書き</span> : null}
              {dirty.has(selKey) && <span className="ml-1 text-[11px] text-amber-600">● 未保存</span>}
            </p>
          </div>
          <button type="button" onClick={() => moveSel(-1)} disabled={idx <= 0} aria-label="前の日"
            className="h-9 w-9 rounded-lg border border-zinc-200 text-zinc-500 disabled:opacity-30">←</button>
          <button type="button" onClick={() => moveSel(1)} disabled={idx >= days.length - 1} aria-label="次の日"
            className="h-9 w-9 rounded-lg border border-zinc-200 text-zinc-500 disabled:opacity-30">→</button>
          <button type="button" onClick={() => setSel(null)} aria-label="閉じる"
            className="h-9 w-9 rounded-lg text-xl text-zinc-400 xl:hidden">×</button>
        </div>

        {(off || caddy || req) && (
          <div className="mt-3 space-y-1 rounded-lg bg-zinc-50 p-2 text-xs">
            {off && (
              <p className={off.status === "approved" ? "font-medium text-rose-600" : "text-rose-500"}>
                🛌 {off.status === "approved" ? "休み（承認済み）" : "休み希望（未処理）"}{off.reason ? `：${off.reason}` : ""}
              </p>
            )}
            {caddy && <p className="font-medium text-amber-700">⛳ キャディ派遣：{caddy}</p>}
            {req && (
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-zinc-600">
                  本人の希望：<span className="font-semibold">{reqLabel(req, tmap)}</span>{req.memo ? `（${req.memo}）` : ""}
                </p>
                {reqTimes(req, tmap) && !published && (
                  <button type="button" onClick={() => applyRequest(s.id, d)}
                    className="shrink-0 rounded-md border border-brand px-2 py-1 text-xs font-medium text-brand">
                    希望どおりに入れる
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <p className="mb-1.5 mt-3 text-xs font-medium text-zinc-500">シフト</p>
        <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-1.5">
          {templates.map((tp) => {
            const active = c?.template_id === tp.id;
            return (
              <button key={tp.id} type="button" onClick={() => setTemplate(s.id, d, tp.id)}
                className={opt(active)}
                style={!active ? { color: tp.is_day_off ? "#e11d48" : tp.color } : undefined}>
                {tLabel(tp)}
                {!tp.is_day_off && tp.name && tLabel(tp) !== tp.name && (
                  <span className={`block text-[10px] font-normal ${active ? "text-white/80" : "text-zinc-400"}`}>{tp.name}</span>
                )}
              </button>
            );
          })}
          <button type="button" onClick={() => setTemplate(s.id, d, CUSTOM)} className={opt(isCustom)}>
            ⌚ 時間指定
          </button>
        </div>

        {isCustom && (
          <div className="mt-2 flex items-center gap-2">
            <input type="time" value={c?.start_time?.slice(0, 5) ?? ""} onChange={(e) => setCustomTime(s.id, d, "start", e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-2 py-2 text-base md:text-sm" />
            <span className="text-zinc-400">〜</span>
            <input type="time" value={c?.end_time?.slice(0, 5) ?? ""} onChange={(e) => setCustomTime(s.id, d, "end", e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-2 py-2 text-base md:text-sm" />
          </div>
        )}

        {myTypes.length > 0 && (
          <>
            <p className="mb-1.5 mt-3 text-xs font-medium text-zinc-500">業務</p>
            <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-1.5">
              {myTypes.map((wt) => {
                const active = c?.schedule_type_id === wt.id;
                return (
                  <button key={wt.id} type="button" onClick={() => setTemplate(s.id, d, `${WT_PREFIX}${wt.id}`)}
                    className={opt(active)} style={!active ? { color: wt.color } : undefined}>
                    {wt.name}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
          {filled && (published ? (
            <button type="button" disabled={pending} onClick={() => unpublishOne(s.id, d)}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 disabled:opacity-50">
              🔒 確定を解除して直す
            </button>
          ) : (
            <button type="button" disabled={pending} onClick={() => publishOne(s.id, d)}
              className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              ✓ この日を確定・通知
            </button>
          ))}
          {filled && !published && (
            <button type="button" onClick={() => setTemplate(s.id, d, "")}
              className="rounded-lg px-3 py-2 text-sm text-zinc-500 active:bg-zinc-100">
              空にする
            </button>
          )}
          {dirty.size > 0 && (
            <button type="button" disabled={pending} onClick={() => save(false)}
              className="ml-auto rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 disabled:opacity-50">
              保存（{dirty.size}件）
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 md:gap-3">
        <Button onClick={() => save(false)} disabled={pending || dirty.size === 0}>
          {pending ? "処理中…" : `保存（${dirty.size}件）`}
        </Button>
        <Button variant="secondary" onClick={applyAllRequests} disabled={pending} title={`${rangeLabel}の空いているセルにだけ希望を入れます`}>
          希望を一括反映
        </Button>
        <Button variant="secondary" onClick={publish} disabled={pending} title={`${rangeLabel}の未確定ぶんだけを確定します`}>
          {rangeShort}をまとめて確定・通知
        </Button>
        <div className="ml-auto flex gap-0.5 rounded-lg bg-zinc-100 p-0.5 text-sm">
          <button type="button" onClick={() => setView("calendar")}
            className={`rounded-md px-3 py-1.5 ${view === "calendar" ? "bg-white font-semibold text-brand shadow-sm" : "text-zinc-500"}`}>
            シフト表
          </button>
          <button type="button" onClick={() => { setView("list"); setSel(null); }}
            className={`rounded-md px-3 py-1.5 ${view === "list" ? "bg-white font-semibold text-brand shadow-sm" : "text-zinc-500"}`}>
            日ごと
          </button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs text-zinc-400">{rangeShort}の確定済み {publishedInRange}件</span>
        {dirty.size > 0 && <span className="text-xs text-amber-600">● 未保存の変更あり（15秒ごとに自動保存）</span>}
        {dirtyOutside > 0 && <span className="text-xs text-zinc-400">うち{dirtyOutside}件は表示範囲の外（保存すると一緒に反映されます）</span>}
        {restored && <span className="text-xs text-blue-600">前回の編集内容を復元しました</span>}
        {view === "list" && (
          <label className="flex items-center gap-1.5 text-sm text-zinc-600">
            <input type="checkbox" checked={onlyFilled} onChange={(e) => setOnlyFilled(e.target.checked)} className="h-4 w-4 accent-brand" />
            入っている人だけ
          </label>
        )}
        {msg && <p className="w-full text-sm font-medium text-brand">{msg}</p>}
      </div>

      {view === "list" ? (
        /* 日ごとのリスト（1日＝1枚のカード、1行＝1人）。スマホで縦に見たいとき用（#251） */
        <div className="space-y-3">
          {days.map((d) => {
            const w = dow[new Date(d + "T00:00:00Z").getUTCDay()];
            const rows = staff.map((st) => ({ st, ...renderCell(st, d, "lg") }));
            const shown = onlyFilled ? rows.filter((r) => r.filled) : rows;
            const workingCount = rows.filter((r) => r.working).length;
            const isToday = d === today;
            return (
              <section key={d} id={`shift-day-${d}`} className="scroll-mt-16 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                <header className={`flex items-center gap-2 border-b border-zinc-200 px-3 py-2 ${isToday ? "bg-brand-light" : "bg-zinc-50"}`}>
                  <p className={`text-base font-semibold ${w === "日" ? "text-red-500" : w === "土" ? "text-blue-500" : "text-zinc-800"}`}>
                    {md(d)}<span className="ml-0.5 text-sm">（{w}）</span>
                  </p>
                  {isToday && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">今日</span>}
                  <span className="ml-auto text-xs text-zinc-500">出勤 {workingCount}人</span>
                </header>
                {shown.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-zinc-400">入っている人はいません</p>
                ) : (
                  <ul className="divide-y divide-zinc-100">
                    {shown.map((r) => (
                      <li key={r.st.id} className={`flex items-start gap-2 px-3 py-2 ${r.bg}`}>
                        <p className="w-24 shrink-0 pt-2 text-sm font-medium leading-tight text-zinc-700">{r.st.name}{hoursBadge(r.st, "lg")}</p>
                        <div className="min-w-0 flex-1 md:max-w-sm">{r.body}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        /* シフト表（店舗ダッシュボードと同じ見た目）＋ 右に編集パネル */
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_284px]">
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-20 border-b border-r border-zinc-200 bg-zinc-50 px-2 py-2 text-left text-[11px] font-medium text-zinc-500">
                    スタッフ
                    <span className="block text-[9px] font-normal text-zinc-400">{rangeShort}の時間</span>
                  </th>
                  {days.map((d, di) => {
                    const w = dow[new Date(d + "T00:00:00Z").getUTCDay()];
                    const isToday = d === today;
                    const isSelDay = sel?.date === d;
                    const showMonth = di === 0 || d.slice(8) === "01";
                    const working = staff.filter((st) => {
                      const ch = chipFor(st, d);
                      return ch && ch.kind !== "off";
                    }).length;
                    const hasReq = staff.some((st) => reqMap.has(`${st.id}|${d}`));
                    const hasOff = staff.some((st) => !!timeOff[`${st.id}|${d}`]);
                    return (
                      <th key={d} className={`min-w-10 border-b border-r border-zinc-100 px-0.5 py-1.5 text-center last:border-r-0 ${isSelDay ? "bg-brand-light" : "bg-zinc-50"}`}>
                        {showMonth && <span className="block text-[9px] font-normal text-zinc-400">{Number(d.slice(5, 7))}月</span>}
                        <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold ${
                          isToday ? "bg-brand text-white" : w === "日" ? "text-red-500" : w === "土" ? "text-blue-500" : "text-zinc-600"}`}>
                          {Number(d.slice(8))}
                        </span>
                        <span className={`block text-[10px] font-normal ${w === "日" ? "text-red-400" : w === "土" ? "text-blue-400" : "text-zinc-400"}`}>（{w}）</span>
                        <span className="block text-[9px] font-normal text-zinc-400">{working}人</span>
                        <span className="flex h-2 items-center justify-center gap-0.5">
                          {hasReq && <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" title="希望あり" />}
                          {hasOff && <span className="h-1.5 w-1.5 rounded-full bg-rose-400" title="休み希望あり" />}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id}>
                    <th className={`sticky left-0 z-10 whitespace-nowrap border-b border-r border-zinc-200 px-2 py-1.5 text-left text-xs font-semibold text-zinc-700 ${sel?.staffId === s.id ? "bg-brand-light" : "bg-white"}`}>
                      {s.name}
                      {hoursBadge(s)}
                    </th>
                    {days.map((d) => {
                      const key = `${s.id}|${d}`;
                      const chip = renderChip(s, d);
                      const req = reqMap.get(key);
                      const off = timeOff[key];
                      const caddy = caddyDays[key];
                      const isSel = key === selKey;
                      return (
                        <td key={d} className={`border-b border-r border-zinc-100 p-0 align-top last:border-r-0 ${
                          isSel ? "bg-brand-light" : d === today ? "bg-amber-50/60" : off?.status === "approved" ? "bg-rose-50/60" : ""}`}>
                          <button type="button" onClick={() => setSel({ staffId: s.id, date: d })}
                            aria-label={`${s.name} ${md(d)}`}
                            className={`block min-h-11 w-full space-y-0.5 p-0.5 text-left ${isSel ? "ring-2 ring-inset ring-brand" : "hover:bg-zinc-50"} ${dirty.has(key) ? "outline-2 -outline-offset-2 outline-dashed outline-amber-400" : ""}`}>
                            {chip}
                            {!chip && req && (
                              <span className="block truncate rounded border border-dashed border-zinc-300 px-0.5 py-0.5 text-center text-[9px] leading-tight text-zinc-400">
                                希望<br />{reqLabel(req, tmap)}
                              </span>
                            )}
                            {off && !chip && (
                              <span className={`block text-center text-[9px] font-medium ${off.status === "approved" ? "text-rose-600" : "text-rose-400"}`}>
                                休希望
                              </span>
                            )}
                            {caddy && <span className="block truncate text-center text-[9px] font-medium text-amber-700" title={caddy}>⛳</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap gap-3 border-t border-zinc-100 px-3 py-2 text-[10px] text-zinc-400">
              <span><span className="mr-1 inline-block rounded border border-sky-300 bg-sky-50 px-1 text-[9px] font-semibold text-sky-700">10:00</span>確定</span>
              <span><span className="mr-1 inline-block rounded border border-dashed border-sky-300 bg-white px-1 text-[9px] font-semibold text-sky-500">10:00</span>下書き</span>
              <span><span className="mr-1 inline-block rounded bg-rose-500 px-1 text-[9px] font-semibold text-white">休み</span>休み</span>
              <span><span className="mr-1 inline-block rounded border border-dashed border-zinc-300 px-1 text-[9px]">希望</span>本人の希望（未入力）</span>
              <span><span className="mr-1 inline-block h-2.5 w-3 rounded-sm outline-2 outline-dashed outline-amber-400" />未保存</span>
              <span>⛳ キャディ派遣</span>
              <span><span className="mr-1 font-semibold text-sky-600">計 8h</span>名前の下＝表示中の期間の労働時間（下書き・未保存も含む／休憩を引いた時間。緑は全部確定）</span>
            </div>
          </div>

          {/* PC: 右に固定 */}
          <div className="hidden xl:sticky xl:top-4 xl:block">{editor()}</div>
        </div>
      )}

      {/* PCより狭い画面: 下から出るパネル。表の下の方が隠れないように同じ高さの余白を足す */}
      {view === "calendar" && sel && <div className="h-[60vh] xl:hidden" aria-hidden />}
      {view === "calendar" && sel && (
        <div className="fixed inset-x-0 bottom-0 z-40 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-zinc-200 bg-white shadow-2xl xl:hidden">
          {editor()}
        </div>
      )}
    </div>
  );
}
