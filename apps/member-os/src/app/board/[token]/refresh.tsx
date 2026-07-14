"use client";

import { useEffect, useState } from "react";

/** 店頭掲示用: 60秒ごとに自動リロードし最新の予約を反映＋ライブ時計 */
export function BoardAutoRefresh({ intervalSec = 60 }: { intervalSec?: number }) {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    tick();
    const clock = setInterval(tick, 1000 * 20);
    const reload = setInterval(() => window.location.reload(), 1000 * intervalSec);
    return () => { clearInterval(clock); clearInterval(reload); };
  }, [intervalSec]);
  return <span className="tabular-nums">{now}</span>;
}
