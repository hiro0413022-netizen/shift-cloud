"use client";

import { useState } from "react";
import { openSlip } from "./actions";
import { btnDarkCls, btnGhostCls } from "@/components/ui";

type Table = { id: string; code: string; seats: number };
type Cast = { id: string; displayName: string };

/**
 * ご案内の入口。ボーイが片手で押せるよう、選ぶのは「卓・人数・連れてきた人」の3つだけ。
 * 連れてきた人をここで選ばせるのは、あとから分からなくなるのを防ぐため（設計の要）。
 */
export function NewGuest({ tables, casts }: { tables: Table[]; casts: Cast[] }) {
  const [open, setOpen] = useState(false);
  const [tableId, setTableId] = useState<string | null>(null);
  const [guests, setGuests] = useState(2);
  const [castId, setCastId] = useState<string>("");
  const [kind, setKind] = useState<"douhan" | "referral">("douhan");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={btnDarkCls} disabled={tables.length === 0}>
        ＋ 新規ご来店
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30 sm:items-center sm:justify-center">
      <form
        action={openSlip}
        className="max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-white p-5 sm:max-w-2xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center">
          <h2 className="text-base font-bold">ご案内</h2>
          <div className="grow" />
          <button type="button" onClick={() => setOpen(false)} className="text-sm text-(--color-dim)">
            閉じる
          </button>
        </div>

        <p className="mb-2 text-xs text-(--color-dim)">1. 卓</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {tables.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => setTableId(t.id)}
              className={`min-h-11 rounded-lg border px-4 text-sm font-medium ${
                tableId === t.id ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent)" : "border-(--color-line)"
              }`}
            >
              {t.code}
            </button>
          ))}
        </div>
        <input type="hidden" name="tableId" value={tableId ?? ""} />

        <p className="mb-2 text-xs text-(--color-dim)">2. 人数</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 8].map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => setGuests(n)}
              className={`min-h-11 w-14 rounded-lg border text-sm font-medium ${
                guests === n ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent)" : "border-(--color-line)"
              }`}
            >
              {n}名
            </button>
          ))}
        </div>
        <input type="hidden" name="guests" value={guests} />

        <p className="mb-1 text-xs text-(--color-dim)">3. このお客様を連れてきたのは</p>
        <p className="mb-2 text-[11px] text-(--color-mute)">選ばなくても進めます。あとから伝票で変えられます。</p>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCastId("")}
            className={`min-h-11 rounded-lg border px-4 text-sm ${
              castId === "" ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent)" : "border-(--color-line)"
            }`}
          >
            フリー来店
          </button>
          {casts.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => setCastId(c.id)}
              className={`min-h-11 rounded-lg border px-4 text-sm ${
                castId === c.id ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent)" : "border-(--color-line)"
              }`}
            >
              {c.displayName}
            </button>
          ))}
        </div>
        <input type="hidden" name="broughtByCastId" value={castId} />

        {castId && (
          <div className="mb-4 flex gap-2">
            {(["douhan", "referral"] as const).map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => setKind(k)}
                className={`min-h-11 rounded-lg border px-4 text-sm ${
                  kind === k ? "border-(--color-ok) bg-(--color-ok-soft) text-(--color-ok)" : "border-(--color-line)"
                }`}
              >
                {k === "douhan" ? "同伴（一緒に来店）" : "紹介（お客様だけ）"}
              </button>
            ))}
          </div>
        )}
        <input type="hidden" name="broughtKind" value={kind} />

        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className={btnGhostCls}>
            キャンセル
          </button>
          <button className={`${btnDarkCls} grow`} disabled={!tableId}>
            伝票を開く
          </button>
        </div>
      </form>
    </div>
  );
}
