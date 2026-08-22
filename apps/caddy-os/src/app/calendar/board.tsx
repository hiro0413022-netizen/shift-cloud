"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignDispatch, confirmDay, confirmMonth, removeDispatch, setAvailability, setDispatchStatus } from "../actions";
import { STATUS_LABEL, STATUS_TONE, type BoardAvailability, type BoardDispatch } from "@/lib/shift";
import { clientTone, dispatchChipCls } from "@/lib/client-colors";

const WD = ["日", "月", "火", "水", "木", "金", "土"];

const AV_MARK: Record<string, string> = { available: "○", maybe: "△", unavailable: "×" };

/** 名前を押すたびに 空欄 → ○ → △ → × → 空欄 と一巡する（/availability の表と同じ操作感） */
const AV_NEXT: Record<string, "available" | "maybe" | "unavailable" | ""> = {
  "": "available",
  available: "maybe",
  maybe: "unavailable",
  unavailable: "",
};
const AV_CHIP: Record<string, string> = {
  available: "border-emerald-300 bg-emerald-50 text-emerald-800",
  maybe: "border-amber-300 bg-amber-50 text-amber-800",
  unavailable: "border-slate-300 bg-slate-100 text-slate-500 line-through",
  "": "border-(--color-line) bg-white text-(--color-dim)",
};

type Named = { id: string; name: string };

/**
 * 月間カレンダー（クライアント）。
 *
 * 設計の意図:
 *  - 「見る」と「決める」を1画面に置く。日セルをタップすると下のパネルにその日の詳細が出る。
 *  - **希望が来ていないキャディも必ず候補に出す**（希望提出は任意。電話で押さえた分を
 *    こちらから入れられないと現場が回らない）。並び順だけ ○ → △ → 未回答 → × とし、
 *    どの状態かはラベルで分かるようにする。この日の希望はパネル内で代理入力もできる。
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


  const counts = useMemo(() => {
    let tentative = 0;
    let confirmed = 0;
    for (const d of dispatches) {
      if (d.status === "tentative") tentative += 1;
      if (d.status === "confirmed") confirmed += 1;
    }
    return { tentative, confirmed };
  }, [dispatches]);

  type ActionResult = { error?: string; count?: number; updated?: boolean; unchanged?: boolean };
  const run = (fn: () => Promise<ActionResult>, okText: string | ((r: ActionResult) => string), onOk?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: typeof okText === "function" ? okText(r) : okText });
      if (!r.error) onOk?.();
      // 成功・失敗にかかわらずサーバーの最新状態を取り直す。
      // （失敗＝「既に割り当て済み」等はサーバー側の実態と画面がズレている合図なので、むしろ再取得が要る）
      router.refresh();
      setTimeout(() => setMsg(null), r.error ? 6000 : 3000);
    });

  // 追加フォームの結果メッセージ（新規 / 仮→確定の更新 / 既に同内容）
  const assignText = (label: "仮" | "確定") => (r: ActionResult) =>
    r.unchanged ? `既に${label}で入っています（変更なし）` : r.updated ? `${label}に更新しました` : `${label}で追加しました`;

  // 月初の曜日ぶんだけ先頭に空セルを入れて、日曜始まりの表にする
  const lead = new Date(`${days[0]}T00:00:00Z`).getUTCDay();
  const cells: Array<string | null> = [...Array<null>(lead).fill(null), ...days];

  const dayDispatches = useMemo(() => (selected ? (byDay.get(selected) ?? []) : []), [selected, byDay]);
  const dayAvailability = useMemo(() => (selected ? (avByDay.get(selected) ?? []) : []), [selected, avByDay]);
  const avSource = useMemo(() => new Map(dayAvailability.map((a) => [a.partner_id, a.source])), [dayAvailability]);

  // 候補は「稼働中のキャディ全員」。希望を出していない人も必ず出す（#144）。
  // 並びは ○ → △ → 未回答 → × 。× の人も選べるが、選ぶと確認文が出る。
  const candidates = useMemo(() => {
    // 割当済みの判定は「同じ日 × 同じキャディ」（取消は除く）＝サーバー側の重複判定と同じ条件
    const assigned = new Map<string, BoardDispatch>();
    for (const d of dayDispatches) if (d.status !== "cancelled") assigned.set(d.partner_id ?? d.staff_id ?? "", d);
    const avail = new Map(dayAvailability.map((a) => [a.partner_id, a.status]));
    const rank = (id: string) =>
      avail.get(id) === "available" ? 0 : avail.get(id) === "maybe" ? 1 : avail.get(id) === "unavailable" ? 3 : 2;
    return partners
      .map((p) => ({
        ...p,
        av: avail.get(p.id) ?? "",
        mark: AV_MARK[avail.get(p.id) ?? ""] ?? "",
        rank: rank(p.id),
        taken: assigned.get(p.id) ?? null,
      }))
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "ja"));
  }, [partners, dayAvailability, dayDispatches]);

  // ドロップダウンの見出し（希望の有無で分ける。未回答でもそのまま選べることを文言で示す）
  const candidateGroups = useMemo(
    () =>
      [
        { key: "yes", label: "出勤希望あり（○ / △）", rows: candidates.filter((p) => p.rank <= 1) },
        { key: "none", label: "希望なし・未回答（そのまま割り当てできます）", rows: candidates.filter((p) => p.rank === 2) },
        { key: "no", label: "×（不可と回答）※どうしてもの時だけ", rows: candidates.filter((p) => p.rank === 3) },
      ].filter((g) => g.rows.length > 0),
    [candidates]
  );

  // いま選んでいるキャディがその日に既に入っているか（仮なら［確定］で更新できる）
  const selectedExisting = useMemo(() => {
    if (!assignee) return null;
    const id = assignee.slice(2);
    return dayDispatches.find((d) => d.status !== "cancelled" && (d.partner_id ?? d.staff_id) === id) ?? null;
  }, [assignee, dayDispatches]);

  return (
    <div>
      {/* 凡例: 色=ゴルフ場 / 形=状態（#146） */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
        <span className="text-(--color-dim)">色＝ゴルフ場</span>
        {clients.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${clientTone(c.id, c.name).dot}`} />
            {c.name}
          </span>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
        <span className="text-(--color-dim)">形＝状態</span>
        <span className="flex items-center gap-1">
          <span className="inline-block rounded border border-slate-400 bg-slate-100 px-1.5 leading-4">確定</span>
          塗りつぶし＋実線
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block rounded border border-dashed border-slate-400 bg-white px-1.5 leading-4">
            仮
          </span>
          白地＋破線
        </span>
      </div>

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
                    className={`truncate rounded px-1 text-[10px] leading-4 ${dispatchChipCls(x.client_id, x.status, x.client_name)}`}
                    title={`${x.caddie_name} / ${x.client_name ?? "ゴルフ場未定"} / ${STATUS_LABEL[x.status]}`}
                  >
                    {x.status === "tentative" ? <span className="font-medium">仮 </span> : null}
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
              {candidateGroups.map((g) => (
                <optgroup key={g.key} label={g.label}>
                  {g.rows.map((p) => (
                    <option key={p.id} value={`p:${p.id}`} disabled={p.taken?.status === "confirmed"}>
                      {p.mark ? `${p.mark} ` : ""}
                      {p.name}
                      {p.taken ? `（${STATUS_LABEL[p.taken.status]}で割当済）` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
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
              disabled={pending || !assignee || !!selectedExisting}
              onClick={() =>
                run(
                  () => assignDispatch({ dispatch_date: selected, client_id: clientId || null, assignee, status: "tentative" }),
                  assignText("仮"),
                  () => setAssignee("")
                )
              }
              className="rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm disabled:opacity-50"
            >
              仮で追加
            </button>
            <button
              type="button"
              disabled={pending || !assignee || selectedExisting?.status === "confirmed"}
              onClick={() =>
                run(
                  () => assignDispatch({ dispatch_date: selected, client_id: clientId || null, assignee, status: "confirmed" }),
                  assignText("確定"),
                  () => setAssignee("")
                )
              }
              className="rounded-lg bg-(--color-accent) px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {selectedExisting?.status === "tentative" ? "確定" : "確定で追加"}
            </button>
          </div>
          {selectedExisting ? (
            <p className="-mt-2 mb-4 text-xs text-(--color-dim)">
              {selectedExisting.caddie_name} はこの日すでに<b>{STATUS_LABEL[selectedExisting.status]}</b>で入っています
              {selectedExisting.status === "tentative"
                ? "。［確定］を押すとその割当が確定になります（二重登録はされません）"
                : "。変更する場合は下の一覧から「仮に戻す」「取消」をしてください"}
            </p>
          ) : null}

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
                  <span
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${dispatchChipCls(
                      d.client_id,
                      d.status,
                      d.client_name
                    )}`}
                  >
                    <span className={`inline-block h-2 w-2 rounded-sm ${clientTone(d.client_id, d.client_name).dot}`} />
                    {d.client_name ?? "ゴルフ場未定"}
                  </span>
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

          {/* ── その日の出勤希望（管理者がその場で代理入力できる・#144） ── */}
          <div>
            <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-xs font-medium text-(--color-dim)">この日の出勤希望</p>
              <p className="text-[11px] text-(--color-dim)">
                名前を押すたびに 空欄 → ○ → △ → × と変わります（電話やLINEで聞いた分をここに入れられます）
              </p>
            </div>
            {candidates.length === 0 ? (
              <p className="text-xs text-(--color-dim)">稼働中のキャディが登録されていません（設定 ＞ 委託先）</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {candidates.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={pending}
                    title={
                      avSource.get(p.id) === "self"
                        ? "本人がスマホから提出"
                        : avSource.get(p.id)
                          ? "管理者が代理入力"
                          : "未回答（押すと ○ になります）"
                    }
                    onClick={() =>
                      run(
                        () => setAvailability(p.id, selected, AV_NEXT[p.av] ?? "available"),
                        `${p.name} の希望を「${AV_MARK[AV_NEXT[p.av] ?? "available"] ?? "未回答"}」にしました`
                      )
                    }
                    className={`rounded border px-2 py-1 text-xs disabled:opacity-50 ${AV_CHIP[p.av] ?? AV_CHIP[""]}`}
                  >
                    {p.mark || "－"} {p.name}
                    {avSource.get(p.id) === "self" ? "＊" : ""}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-[11px] text-(--color-dim)">
              ＊ はキャディ本人がスマホから提出したものです。
              <b>希望が来ていなくても、上の「キャディを選ぶ」からそのまま割り当てできます。</b>
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
