"use client";

import { useState } from "react";
import { setBroughtBy } from "./actions";

type Cast = { id: string; displayName: string };

/**
 * 「このお客様を連れてきたのは」。
 * ここを変えるとその日の時給アップが付く人が変わるので、いつでも直せるようにしておく。
 */
export function BroughtBy({
  slipId,
  casts,
  currentCastId,
  currentKind,
  currentName,
}: {
  slipId: string;
  casts: Cast[];
  currentCastId: string | null;
  currentKind: "douhan" | "referral" | "free" | null;
  currentName: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [castId, setCastId] = useState(currentCastId ?? "");
  const [kind, setKind] = useState<"douhan" | "referral">(currentKind === "referral" ? "referral" : "douhan");

  if (!editing) {
    return (
      <div className="rounded-xl border border-(--color-line) bg-white p-3">
        <div className="mb-2 text-[11px] font-bold text-(--color-dim)">このお客様を連れてきたのは</div>
        <div className="flex items-center gap-3">
          <div className="grow">
            <div className="text-[13px] font-medium">{currentName ?? "フリー来店"}</div>
            <div className="text-[10px] text-(--color-dim)">
              {currentName ? (currentKind === "douhan" ? "同伴" : "紹介") : "担当なし"}
            </div>
          </div>
          <button onClick={() => setEditing(true)} className="min-h-11 rounded-lg border border-(--color-line) px-4 text-xs font-medium">
            変更
          </button>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-(--color-mute)">
          ここを変えると、この卓の売上と時給アップが付く人が変わります。
        </p>
      </div>
    );
  }

  return (
    <form action={setBroughtBy} className="rounded-xl border border-(--color-accent) bg-white p-3">
      <input type="hidden" name="slipId" value={slipId} />
      <input type="hidden" name="castId" value={castId} />
      <input type="hidden" name="broughtKind" value={kind} />
      <div className="mb-2 text-[11px] font-bold">連れてきた人を選ぶ</div>
      <div className="mb-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCastId("")}
          className={`min-h-11 rounded-lg px-3 text-xs ${castId === "" ? "bg-(--color-txt) text-white" : "border border-(--color-line)"}`}
        >
          フリー来店
        </button>
        {casts.map((c) => (
          <button
            type="button"
            key={c.id}
            onClick={() => setCastId(c.id)}
            className={`min-h-11 rounded-lg px-3 text-xs ${
              castId === c.id ? "bg-(--color-txt) text-white" : "border border-(--color-line)"
            }`}
          >
            {c.displayName}
          </button>
        ))}
      </div>
      {castId && (
        <div className="mb-2 flex gap-2">
          {(["douhan", "referral"] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setKind(k)}
              className={`min-h-11 rounded-lg px-3 text-xs ${
                kind === k ? "bg-(--color-ok-soft) text-(--color-ok)" : "border border-(--color-line)"
              }`}
            >
              {k === "douhan" ? "同伴" : "紹介"}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => setEditing(false)} className="min-h-11 rounded-lg border border-(--color-line) px-4 text-xs">
          やめる
        </button>
        <button className="min-h-11 grow rounded-lg bg-(--color-accent) text-xs font-bold text-white">この人にする</button>
      </div>
    </form>
  );
}
