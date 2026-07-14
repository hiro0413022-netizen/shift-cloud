"use client";

import { useEffect, useRef, useState } from "react";

/** 数値カウントアップ（reduced-motion時は即時表示） */
export function CountUp({ value, decimals, duration = 900 }: { value: number; decimals?: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setDisplay(value * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  const d = decimals ?? (Number.isInteger(value) ? 0 : 1);
  return <>{display.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d })}</>;
}
