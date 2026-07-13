"use client";

import { useRef, useState } from "react";
import { PhaseBar } from "@/components/phase-bar";
import { hasPhases, type Phases } from "@/lib/phases";

/**
 * 生徒共有ページの動画（DECISIONS #51）
 * コーチが付けたフェーズにワンタップで移動できる（閲覧のみ・編集不可）。
 * スロー再生とコマ送りも生徒側で使えるようにしている。
 */
export function ShareVideo({ src, phases }: { src: string; phases: Phases | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);

  const jump = (t: number) => {
    const v = ref.current;
    if (!v) return;
    v.pause();
    v.currentTime = t;
    setCur(t);
  };
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
        src={src}
        controls
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onSeeked={(e) => setCur(e.currentTarget.currentTime)}
        className="max-h-96 w-full bg-black"
      />
      <div className="space-y-2 border-b border-gray-100 px-4 py-3">
        {hasPhases(phases) && (
          <PhaseBar phases={phases} duration={dur} current={cur} onJump={jump} theme="light" />
        )}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button onClick={() => step(-1 / 30)} className="rounded-lg border border-[#c8d4e2] px-2 py-1 text-[#1e5da8]">⏴ コマ戻し</button>
          <button onClick={() => step(1 / 30)} className="rounded-lg border border-[#c8d4e2] px-2 py-1 text-[#1e5da8]">コマ送り ⏵</button>
          {[0.25, 0.5, 1].map((r) => (
            <button
              key={r}
              onClick={() => { setRate(r); if (ref.current) ref.current.playbackRate = r; }}
              className={`rounded-lg border px-2 py-1 ${rate === r ? "border-[#1e5da8] bg-[#1e5da8] text-white" : "border-[#c8d4e2] text-[#1e5da8]"}`}
            >
              {r}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
