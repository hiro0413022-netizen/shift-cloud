"use client";

import { useEffect, useState } from "react";
import { changesSince } from "@/app/(main)/home-actions";
import { changesLine, sinceLabel, type ChangeCounts } from "@/lib/home-pure";

/**
 * ② 前回見た時からの変化（#244）。
 * 「前回」はこのブラウザが最後にホームを開いた時刻（localStorage）。サーバーはその時刻以降の件数を数えるだけ。
 * 初めて開いたときは何も出さない（比べる相手がない）。
 */
const KEY = "gn.home.lastSeen";

export function ChangesLine() {
  const [since, setSince] = useState<string | null>(null);
  const [counts, setCounts] = useState<ChangeCounts | null>(null);

  useEffect(() => {
    let prev: string | null = null;
    try {
      prev = window.localStorage.getItem(KEY);
      window.localStorage.setItem(KEY, new Date().toISOString());
    } catch {
      /* プライベートモード等 */
    }
    if (!prev) return;
    setSince(prev);
    changesSince(prev)
      .then(setCounts)
      .catch(() => setCounts(null));
  }, []);

  if (!since || !counts) return null;
  const chips = changesLine(counts);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-(--color-dim)">
      <span className="font-bold text-(--color-txt)">前回（{sinceLabel(since)}）から</span>
      {chips.length === 0 ? (
        <span>変化なし</span>
      ) : (
        chips.map((c) => (
          <span key={c.label} className="rounded-full border border-(--color-line) px-2.5 py-0.5">
            {c.label}{" "}
            <b className={c.tone === "ok" ? "text-(--color-ok)" : c.tone === "warn" ? "text-(--color-warn)" : "text-(--color-txt)"}>
              {c.tone === "ok" ? "+" : ""}
              {c.value}
            </b>
          </span>
        ))
      )}
    </div>
  );
}
