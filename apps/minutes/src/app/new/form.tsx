"use client";

import { useActionState, useMemo, useState } from "react";
import { createMeeting } from "./actions";
import { btnCls, cardCls, inputCls } from "@/components/ui";

type LevelOpt = { id: "L1" | "L2" | "L3"; label: string; desc: string; where: string; available: boolean; reason: string | null };
type ModeOpt = { id: string; label: string; desc: string; requiresLevel: string | null };

const RANK: Record<string, number> = { L1: 1, L2: 2, L3: 3 };

export function NewMeetingForm({ today, levels, modes }: { today: string; levels: LevelOpt[]; modes: ModeOpt[] }) {
  const [state, action, pending] = useActionState(createMeeting, {});
  const firstAvailable = levels.find((l) => l.available)?.id ?? "L1";
  const [level, setLevel] = useState<string>(firstAvailable);
  const [source, setSource] = useState("record");
  const usable = useMemo(
    () => modes.filter((m) => !m.requiresLevel || RANK[level] >= RANK[m.requiresLevel]),
    [modes, level]
  );

  return (
    <form action={action} className="space-y-5">
      <section className={`${cardCls} space-y-4`}>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">件名</span>
          <input name="title" required maxLength={120} placeholder="例: A社 契約条件の打ち合わせ" className={inputCls} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">日付</span>
            <input name="meeting_date" type="date" defaultValue={today} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">参加者（任意）</span>
            <input name="participants" placeholder="例: 古川、山本、A社 田中様" className={inputCls} />
          </label>
        </div>
        <p className="text-xs text-(--color-dim)">参加者を入れておくと、AIが話者に名前を当てやすくなります。</p>
      </section>

      <section className={`${cardCls} space-y-3`}>
        <div>
          <h3 className="font-semibold">機密レベル</h3>
          <p className="text-xs text-(--color-dim)">
            録音の前に決めます。<strong>あとから変えられません</strong>（一度外部のAIに送った内容は取り戻せないため）。
          </p>
        </div>
        <div className="grid gap-2">
          {levels.map((l) => (
            <label
              key={l.id}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                level === l.id ? "border-(--color-accent) bg-indigo-50/40" : "border-(--color-line)"
              } ${l.available ? "" : "cursor-not-allowed opacity-60"}`}
            >
              <input
                type="radio"
                name="level"
                value={l.id}
                disabled={!l.available}
                checked={level === l.id}
                onChange={() => setLevel(l.id)}
                className="mt-1"
              />
              <span className="text-sm">
                <span className="font-medium">{l.label}</span>
                <span className="block text-(--color-dim)">{l.desc}</span>
                <span className="block text-xs text-(--color-dim)">処理する場所: {l.where}</span>
                {!l.available && l.reason && <span className="block text-xs text-amber-700">いま使えません: {l.reason}</span>}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className={`${cardCls} space-y-3`}>
        <div>
          <h3 className="font-semibold">要約の種類</h3>
          <p className="text-xs text-(--color-dim)">あとから変えて作り直せます。迷ったら「AIにおまかせ」。</p>
        </div>
        <select name="mode" defaultValue="auto" className={inputCls} key={level}>
          <option value="auto">AIにおまかせ（会話から判定）</option>
          {usable.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — {m.desc}
            </option>
          ))}
        </select>
      </section>

      <section className={`${cardCls} space-y-3`}>
        <h3 className="font-semibold">取り込み方</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { id: "record", label: "その場で録音", desc: "このブラウザで録音" },
            { id: "file", label: "音声ファイル", desc: "ICレコーダー・スマホの録音（50MBまで）" },
            { id: "text", label: "文字起こしを貼る", desc: "Zoom・Teams などの書き起こし" },
          ].map((s) => (
            <label
              key={s.id}
              className={`cursor-pointer rounded-lg border p-3 text-sm ${source === s.id ? "border-(--color-accent) bg-indigo-50/40" : "border-(--color-line)"}`}
            >
              <input type="radio" name="source" value={s.id} checked={source === s.id} onChange={() => setSource(s.id)} className="mr-2" />
              <span className="font-medium">{s.label}</span>
              <span className="mt-1 block text-xs text-(--color-dim)">{s.desc}</span>
            </label>
          ))}
        </div>
        <label className="flex items-start gap-2 rounded-lg bg-(--color-panel-2) p-3 text-sm">
          <input type="checkbox" name="consent" className="mt-1" />
          <span>
            {source === "text"
              ? "この会議の内容を議事録にすることについて、参加者の了承を得ています。"
              : "録音して文字起こしすることについて、参加者全員の了承を得ています。"}
          </span>
        </label>
      </section>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className={`${btnCls} w-full py-3`}>
        {pending ? "作成しています…" : "作成して次へ"}
      </button>
    </form>
  );
}
