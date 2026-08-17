"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitRequests, type RequestEntry } from "./actions";
import { Button, Badge } from "@/components/ui";

type Template = { id: string; name: string; start_time: string | null; end_time: string | null; is_day_off: boolean; color: string };
type Existing = { date: string; template_id: string | null; memo: string | null; start_time: string | null; end_time: string | null };
type Locked = { start_time: string | null; end_time: string | null; is_day_off: boolean };
type Entry = { template_id: string | null; memo: string; start_time: string; end_time: string; custom: boolean };

function hm(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

/**
 * シフト提出フォーム（#138）
 * - 募集期間は無い。表示中の月ぶんをまとめて保存する
 * - 過去日と確定済みの日は編集できない（サーバー側でも弾いている）
 * - 空にして提出＝その日の希望を取り下げ
 */
export function RequestForm({
  from, to, days, today, ymLabel, templates, existing, locked,
}: {
  from: string; to: string; days: string[]; today: string; ymLabel: string;
  templates: Template[]; existing: Existing[]; locked: Record<string, Locked>;
}) {
  const router = useRouter();
  const init: Record<string, Entry> = {};
  for (const e of existing) {
    init[e.date] = {
      template_id: e.template_id,
      memo: e.memo ?? "",
      start_time: e.start_time?.slice(0, 5) ?? "",
      end_time: e.end_time?.slice(0, 5) ?? "",
      custom: !e.template_id && !!(e.start_time || e.end_time),
    };
  }
  const [entries, setEntries] = useState(init);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const dow = ["日", "月", "火", "水", "木", "金", "土"];

  const editable = (d: string) => d >= today && !locked[d];

  function upd(date: string, patch: Partial<Entry>) {
    setEntries((prev) => {
      const base: Entry = prev[date] ?? { template_id: null, memo: "", start_time: "", end_time: "", custom: false };
      return { ...prev, [date]: { ...base, ...patch } };
    });
  }
  function pickTemplate(date: string, id: string) {
    const cur = entries[date];
    if (cur?.template_id === id) { upd(date, { template_id: null }); return; }
    upd(date, { template_id: id, custom: false });
  }
  function toggleCustom(date: string) {
    const cur = entries[date];
    upd(date, { custom: !cur?.custom, template_id: null, start_time: cur?.start_time || "10:00", end_time: cur?.end_time || "19:00" });
  }
  function clearDay(date: string) {
    upd(date, { template_id: null, custom: false, start_time: "", end_time: "", memo: "" });
  }

  function submit() {
    // 編集できる日は「空のまま」も送る＝空にした日は取り下げになる
    const payload: RequestEntry[] = days.filter(editable).map((date) => {
      const v = entries[date];
      return {
        date,
        template_id: v?.custom ? null : v?.template_id ?? null,
        memo: v?.memo ?? "",
        start_time: v?.custom ? v.start_time : null,
        end_time: v?.custom ? v.end_time : null,
      };
    });
    start(async () => {
      const res = await submitRequests(from, to, payload);
      if (res.error) { setMsg(res.error); return; }
      setMsg(`提出しました ✓（${res.saved}日分${res.cleared ? ` / ${res.cleared}日は取り下げ` : ""}）`);
      router.refresh();
    });
  }

  const filled = days.filter((d) => {
    const e = entries[d];
    return editable(d) && (e?.template_id || (e?.custom && e.start_time && e.end_time));
  }).length;
  const lockedCount = days.filter((d) => !!locked[d]).length;
  // 勤務テンプレが1つも無い店舗（例: FRANK GOLF）では時間の直接入力が主役になる
  const noWorkTemplate = templates.every((t) => t.is_day_off);

  return (
    <div className="space-y-2 pb-24">
      {noWorkTemplate && (
        <p className="rounded-lg bg-zinc-100 px-3 py-2 text-xs text-zinc-500">
          この店舗はシフトのテンプレートが未設定です。「⌚ 時間を指定」から出勤できる時間を入れてください。
        </p>
      )}
      {lockedCount > 0 && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {ymLabel}のうち{lockedCount}日はシフトが確定しています。変更したいときは店長に伝えてください。
        </p>
      )}

      {days.map((d) => {
        const w = dow[new Date(d + "T00:00:00Z").getUTCDay()];
        const cur = entries[d];
        const lock = locked[d];
        const past = d < today;
        const ro = past || !!lock;
        return (
          <div key={d} className={`rounded-xl border p-3 shadow-sm ${lock ? "border-emerald-200 bg-emerald-50/50" : past ? "border-zinc-100 bg-zinc-50" : "border-zinc-200 bg-white"}`}>
            <div className="mb-2 flex items-center gap-2">
              <p className={`text-sm font-semibold ${w === "日" ? "text-red-500" : w === "土" ? "text-blue-500" : ""} ${past && !lock ? "text-zinc-400" : ""}`}>
                {d.slice(8)}日（{w}）
              </p>
              {lock && (
                <Badge color="green">
                  確定 {lock.is_day_off ? "休み" : `${hm(lock.start_time)}〜${hm(lock.end_time)}`}
                </Badge>
              )}
              {past && !lock && <span className="text-xs text-zinc-400">過ぎた日</span>}
              {!ro && (cur?.template_id || (cur?.custom && cur.start_time)) && (
                <button type="button" onClick={() => clearDay(d)}
                  className="ml-auto rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
                  取り消す
                </button>
              )}
            </div>

            {ro ? (
              cur?.template_id || cur?.start_time || cur?.memo ? (
                <p className="text-xs text-zinc-500">
                  提出内容: {cur.custom || cur.start_time ? `${cur.start_time}〜${cur.end_time}` : templates.find((t) => t.id === cur.template_id)?.name ?? "—"}
                  {cur.memo ? ` / ${cur.memo}` : ""}
                </p>
              ) : (
                <p className="text-xs text-zinc-400">—</p>
              )
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {templates.map((t) => {
                    const sel = !cur?.custom && cur?.template_id === t.id;
                    return (
                      <button key={t.id} type="button" onClick={() => pickTemplate(d, t.id)}
                        className={`rounded-full border px-3 py-1 text-xs transition ${sel ? "border-transparent text-white shadow" : "border-zinc-300 text-zinc-600"}`}
                        style={sel ? { background: t.color } : undefined}>
                        {t.name}{t.start_time && !t.is_day_off ? ` ${t.start_time.slice(0, 5)}〜${t.end_time?.slice(0, 5)}` : ""}
                      </button>
                    );
                  })}
                  <button type="button" onClick={() => toggleCustom(d)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${cur?.custom ? "border-transparent bg-brand text-white shadow" : "border-zinc-300 text-zinc-600"}`}>
                    ⌚ 時間を指定
                  </button>
                </div>

                {cur?.custom && (
                  <div className="mt-2 flex items-center gap-2">
                    <input type="time" value={cur.start_time} onChange={(e) => upd(d, { start_time: e.target.value })}
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none" />
                    <span className="text-sm text-zinc-400">〜</span>
                    <input type="time" value={cur.end_time} onChange={(e) => upd(d, { end_time: e.target.value })}
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none" />
                  </div>
                )}

                <input
                  className="mt-2 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs focus:border-brand focus:outline-none"
                  placeholder="メモ（例: 17時以降なら残れます）"
                  value={cur?.memo ?? ""}
                  onChange={(e) => upd(d, { memo: e.target.value })}
                />
              </>
            )}
          </div>
        );
      })}

      <div className="fixed inset-x-0 bottom-14 z-10 mx-auto max-w-lg border-t border-zinc-200 bg-white/95 p-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <p className="flex-1 text-xs text-zinc-500">
            {ymLabel} {filled}日分 入力済み {msg && <span className="ml-2 font-medium text-brand">{msg}</span>}
          </p>
          <Button onClick={submit} disabled={pending}>{pending ? "提出中…" : "この月を提出"}</Button>
        </div>
      </div>
    </div>
  );
}
