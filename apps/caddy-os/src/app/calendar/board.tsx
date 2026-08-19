"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignDispatch, confirmDay, confirmMonth, removeDispatch, setDispatchStatus } from "../actions";
import { STATUS_LABEL, STATUS_TONE, type BoardAvailability, type BoardDispatch } from "@/lib/shift";

const WD = ["日", "月", "火", "水", "木", "金", "土"];

const AV_MARK: Record<string, string> = { available: "○", maybe: "△", unavailable: "×" };

type Named = { id: string; name: string };

/**
 * 月間カレンダー（クライアント）。
 *
 * 設計の意図:
 *  - 「見る」と「決める」を1画面に置く。日セルをタップすると下のパネルにその日の詳細が出て、
 *    出勤可能なキャディだけが候補に並ぶ（LINEで集めた希望が、そのまま割当候補になる）。
 *  - 保存は Server Action。押した直後に router.refresh() で確定状態を取り直す
 *    （楽観更新にすると「確定したつもりで確定していない」が一番怖いため、あえてサーバ確定を待つ）。
 */
export function CalendarBoard({
  ym,
  days,
  dispatches,
  availability,
  clients,
  partners,
  staff,
}: {
  ym: string;
  days: string[];
  dispatches: BoardDispatch[];
  availability: BoardAvailability[];
  clients: Named[];
  partners: Named[];
  staff: Named[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? "");
  const [assignee, setAssignee] = useState<string>("");

  const byDay = useMemo(() => {
    const m = new Map<string, BoardDispatch[]>();
    for (const d of dispatches) {
      const cur = m.get(d.dispatch_date) ?? [];
      cur.push(d);
      m.set(d.dispatch_date, cur);
    }
    return m;
  }, [dispatches]);

  const avByDay = useMemo(() => {
    const m = new Map<string, BoardAvailability[]>();
    for (const a of availability) {
      const cur = m.get(a.date) ?? [];
      cur.push(a);
      m.set(a.date, cur);
    }
    return m;
  }, [availability]);

  const partnerName = useMemo(() => new Map(partners.map((p) => [p.id, p.name])), [partners]);

  const counts = useMemo(() => {
    let tentative = 0;
    let confirmed = 0;
    for (const d of dispatches) {
      if (d.status === "tentative") tentative += 1;
      if (d.status === "confirmed") confirmed += 1;
    }
    return { tentative, confirmed };
  }, [dispatches]);

  const run = (fn: () => Promise<{ error?: string; count?: number }>, okText: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: okText });
      if (!r.error) router.refresh();
      setTimeout(() => setMsg(null), 3000);
    });

  // 月初の曜日ぶんだけ先頭に空セルを入れて、日曜始まりの表にする
  const lead = new Date(`${days[0]}T00:00:00Z`).getUTCDay();
  const cells: Array<string | null> = [...Array<null>(lead).fill(null), ...days];

  const dayDispatches = useMemo(() => (selected ? (byDay.get(selected) ?? []) : []), [selected, byDay]);
  const dayAvailability = useMemo(() => (selected ? (avByDay.get(selected) ?? []) : []), [selected, avByDay]);

  // 候補は「その日 ○/△ を出していて、まだ割り当てられていないキャディ」を先頭に出す
  const candidates = useMemo(() => {
    const assigned = new Set(
      dayDispatches.filter((d) => d.status !== "cancelled").map((d) => d.partner_id ?? d.staff_id)
    );
    const avail = new Map(dayAvailability.map((a) => [a.partner_id, a.status]));
    const rank = (id: string) => (avail.get(id) === "available" ? 0 : avail.get(id) === "maybe" ? 1 : 3);
    return partners
      .filter((p) => avail.get(p.id) !== "unavailable")
      .map((p) => ({ ...p, mark: AV_MARK[avail.get(p.id) ?? ""] ?? "", rank: rank(p.id), taken: assigned.has(p.id) }))
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "ja"));
  }, [partners, dayAvailability, dayDispatches]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-emerald-100 px-2 py-1 text-emerald-800">確定 {counts.confirmed}</span>
        <span className="rounded bg-amber-100 px-2 py-1 text-amber-800">仮 {counts.tentative}</span>
        {counts.tentative > 0 ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => confirmMonth(ym), `${ym} の仮をまとめて確定しました`)}
            className="rounded-lg bg-(--color-accent) px-3 py-1 font-medium text-white disabled:opacity-50"
          >
            今月の仮をまとめて確定
          </button>
        ) : null}
        {msg ? <span className={msg.ok ? "text-emerald-700" : "text-red-600"}>{msg.text}</span> : null}
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-(--color-line) bg-(--color-line)">
        {WD.map((w, i) => (
          <div
            key={w}
            className={`bg-(--color-panel-2) py-1 text-center text-[11px] ${
              i === 0 ? "text-red-500" : i === 6 ? "text-sky-600" : "text-(--color-dim)"
            }`}
          >
            {w}
          </div>
        ))}

        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="min-h-20 bg-(--color-panel-2)" />;
          const list = byDay.get(d) ?? [];
          const okCount = (avByDay.get(d) ?? []).filter((a) => a.status === "available").length;
          const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
          const isSel = selected === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setSelected(isSel ? null : d)}
              className={`min-h-20 bg-(--color-panel) p-1 text-left align-top hover:bg-(--color-panel-2) ${
                isSel ? "ring-2 ring-inset ring-(--color-accent)" : ""
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className={`text-xs font-semibold ${wd === 0 ? "text-red-500" : wd === 6 ? "text-sky-600" : ""}`}
                >
                  {Number(d.slice(-2))}
                </span>
                {okCount > 0 ? <span className="text-[10px] text-(--color-dim)">出可{okCount}</span> : null}
              </div>
              <div className="mt-0.5 space-y-0.5">
                {list.slice(0, 4).map((x) => (
                  <div
                    key={x.id}
                    className={`truncate rounded px-1 text-[10px] leading-4 ${STATUS_TONE[x.status]}`}
                    title={`${x.caddie_name} / ${x.client_name ?? "未定"} / ${STATUS_LABEL[x.status]}`}
                  >
                    {x.caddie_name}
                    {x.client_name ? <span className="opacity-70"> {x.client_name}</span> : null}
                  </div>
                ))}
                {list.length > 4 ? (
                  <div className="px-1 text-[10px] text-(--color-dim)">ほか{list.length - 4}件</div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="mt-4 rounded-xl border border-(--color-line) bg-(--color-panel-2) p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">
              {selected.replace(/-/g, "/")}（{WD[new Date(`${selected}T00:00:00Z`).getUTCDay()]}）の割当
            </h3>
            <div className="flex items-center gap-2">
              {dayDispatches.some((d) => d.status === "tentative") ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => confirmDay(selected), "この日を確定しました")}
                  className="rounded-lg bg-(--color-accent) px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  この日をまとめて確定
                </button>
              ) : null}
              <button type="button" onClick={() => setSelected(null)} className="text-xs text-(--color-dim) underline">
                閉じる
              </button>
            </div>
          </div>

          {/* ── 追加フォーム ── */}
          <div className="mb-4 grid gap-2 md:grid-cols-[2fr_2fr_auto_auto]">
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="rounded-lg border border-(--color-line) bg-white px-2 py-2 text-sm"
            >
              <option value="">ゴルフ場を選ぶ</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="rounded-lg border border-(--color-line) bg-white px-2 py-2 text-sm"
            >
              <option value="">キャディを選ぶ</option>
              <optgroup label="キャディ（出勤希望順）">
                {candidates.map((p) => (
                  <option key={p.id} value={`p:${p.id}`} disabled={p.taken}>
                    {p.mark ? `${p.mark} ` : ""}
                    {p.name}
                    {p.taken ? "（割当済）" : ""}
                  </option>
                ))}
              </optgroup>
              {staff.length > 0 ? (
                <optgroup label="自社スタッフ（委託料なし）">
                  {staff.map((s) => (
                    <option key={s.id} value={`s:${s.id}`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
            <button
              type="button"
              disabled={pending || !assignee}
              onClick={() =>
                run(
                  () => assignDispatch({ dispatch_date: selected, client_id: clientId || null, assignee, status: "tentative" }),
                  "仮で追加しました"
                )
              }
              className="rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm disabled:opacity-50"
            >
              仮で追加
            </button>
            <button
              type="button"
              disabled={pending || !assignee}
              onClick={() =>
                run(
                  () => assignDispatch({ dispatch_date: selected, client_id: clientId || null, assignee, status: "confirmed" }),
                  "確定で追加しました"
                )
              }
              className="rounded-lg bg-(--color-accent) px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              確定で追加
            </button>
          </div>

          {/* ── 既存の割当 ── */}
          {dayDispatches.length === 0 ? (
            <p className="text-sm text-(--color-dim)">この日はまだ割当がありません</p>
          ) : (
            <ul className="mb-4 space-y-1">
              {dayDispatches.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm"
                >
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS_TONE[d.status]}`}>
                    {STATUS_LABEL[d.status]}
                  </span>
                  <span className="font-medium">{d.caddie_name}</span>
                  <span className="text-(--color-dim)">{d.client_name ?? "ゴルフ場未定"}</span>
                  {d.staff_id ? (
                    <span className="rounded bg-sky-100 px-1 text-[10px] text-sky-800">自社</span>
                  ) : null}
                  <span className="ml-auto flex items-center gap-2 text-xs">
                    {d.status !== "confirmed" ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => setDispatchStatus(d.id, "confirmed"), "確定しました")}
                        className="rounded bg-(--color-accent) px-2 py-1 font-medium text-white disabled:opacity-50"
                      >
                        確定
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => setDispatchStatus(d.id, "tentative"), "仮に戻しました")}
                        className="rounded border border-(--color-line) px-2 py-1 disabled:opacity-50"
                      >
                        仮に戻す
                      </button>
                    )}
                    {d.status !== "cancelled" ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => setDispatchStatus(d.id, "cancelled"), "取消しました")}
                        className="text-(--color-dim) hover:text-amber-700 disabled:opacity-50"
                      >
                        取消
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => removeDispatch(d.id), "削除しました")}
                      className="text-(--color-dim) hover:text-red-600 disabled:opacity-50"
                    >
                      削除
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* ── その日の出勤希望（LINE等で集めた分・本人提出分） ── */}
          <div>
            <p className="mb-1 text-xs font-medium text-(--color-dim)">この日の出勤希望</p>
            {dayAvailability.length === 0 ? (
              <p className="text-xs text-(--color-dim)">まだ希望が入っていません</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {dayAvailability.map((a) => (
                  <span
                    key={a.partner_id}
                    className={`rounded px-2 py-0.5 text-xs ${
                      a.status === "available"
                        ? "bg-emerald-50 text-emerald-700"
                        : a.status === "maybe"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-400"
                    }`}
                    title={a.source === "self" ? "本人がスマホから提出" : "管理者が代理入力"}
                  >
                    {AV_MARK[a.status]} {partnerName.get(a.partner_id) ?? "（不明）"}
                    {a.source === "self" ? "＊" : ""}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-1 text-[11px] text-(--color-dim)">＊ はキャディ本人がスマホから提出したものです</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
