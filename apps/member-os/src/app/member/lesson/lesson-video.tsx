"use client";

import { useRef, useState } from "react";

/**
 * 会員ページのスイング動画（#210）
 *
 * スロー再生とコマ送りだけ付ける。お客様が自分のスイングを見るとき、
 * 等倍では何も分からない（インパクトは1/100秒で終わる）。
 * サムネイルがあるあいだ動画本体は読み込まない＝**お客様のギガを使わない**。
 */
export function LessonVideo({ src, poster }: { src: string; poster?: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [rate, setRate] = useState(1);

  const step = (s: number) => {
    const v = ref.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, v.currentTime + s);
  };

  return (
    <div>
      <video
        ref={ref}
        src={poster ? src : `${src}#t=0.1`}
        poster={poster ?? undefined}
        controls
        playsInline
        preload={poster ? "none" : "metadata"}
        className="max-h-[70vh] w-full bg-black"
      />
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 text-xs">
        <button onClick={() => step(-1 / 30)} className="rounded-lg border border-(--color-line) px-2 py-1 text-(--color-dim)">⏴ コマ戻し</button>
        <button onClick={() => step(1 / 30)} className="rounded-lg border border-(--color-line) px-2 py-1 text-(--color-dim)">コマ送り ⏵</button>
        {[0.25, 0.5, 1].map((r) => (
          <button
            key={r}
            onClick={() => { setRate(r); if (ref.current) ref.current.playbackRate = r; }}
            className={`rounded-lg border px-2 py-1 ${
              rate === r ? "border-(--color-gold) bg-(--color-gold) text-black" : "border-(--color-line) text-(--color-dim)"
            }`}
          >
            {r}x
          </button>
        ))}
      </div>
    </div>
  );
}
