"use client";

import { useRef, useState } from "react";
import { videoPlayUrls } from "./actions";

/**
 * スイング映像の比較再生（PGA NOTE準拠）
 * 過去vs現在 / 生徒vsお手本 を横並びで同時再生。個別シークも可能。
 */
export type CompareSource = {
  id: string;
  label: string; // 例: "7/13 DR 220yd" / "お手本: 井殿プロ DR"
  kind: "student" | "model";
};

export function CompareView({ sources }: { sources: CompareSource[] }) {
  const [leftId, setLeftId] = useState<string>(sources[0]?.id ?? "");
  const [rightId, setRightId] = useState<string>(sources.find((s) => s.kind === "model")?.id ?? sources[1]?.id ?? "");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const lRef = useRef<HTMLVideoElement>(null);
  const rRef = useRef<HTMLVideoElement>(null);

  const load = async () => {
    if (!leftId || !rightId) { setMsg("左右の動画を選んでください"); return; }
    setBusy(true);
    setMsg(null);
    const r = await videoPlayUrls([leftId, rightId]);
    setBusy(false);
    if (r.urls) setUrls(r.urls);
    else setMsg(r.error ?? "読み込みに失敗しました");
  };

  const both = (fn: (v: HTMLVideoElement) => void) => {
    if (lRef.current) fn(lRef.current);
    if (rRef.current) fn(rRef.current);
  };
  const playBoth = () => both((v) => { v.playbackRate = rate; void v.play(); });
  const pauseBoth = () => both((v) => v.pause());
  const restartBoth = () => both((v) => { v.currentTime = 0; v.playbackRate = rate; void v.play(); });

  const Sel = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input-dark w-full">
      <option value="">選択してください</option>
      <optgroup label="この生徒のスイング">
        {sources.filter((s) => s.kind === "student").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </optgroup>
      <optgroup label="コーチのお手本">
        {sources.filter((s) => s.kind === "model").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </optgroup>
    </select>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-[--color-dim]">
        過去と現在のスイング、またはコーチのお手本と並べて同時再生できます
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Sel value={leftId} onChange={setLeftId} />
        <Sel value={rightId} onChange={setRightId} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={load} disabled={busy} className="btn-gold">{busy ? "読み込み中…" : "比較をはじめる"}</button>
        {urls[leftId] && urls[rightId] && (
          <>
            <button onClick={playBoth} className="btn-ghost">▶ 同時再生</button>
            <button onClick={pauseBoth} className="btn-ghost">⏸ 停止</button>
            <button onClick={restartBoth} className="btn-ghost">⏮ 最初から</button>
            {[0.25, 0.5, 1].map((r) => (
              <button
                key={r}
                onClick={() => { setRate(r); both((v) => { v.playbackRate = r; }); }}
                className={`rounded-lg border px-2 py-1.5 text-xs ${rate === r ? "border-[--color-gold] text-[--color-gold]" : "border-[--color-line] text-[--color-dim]"}`}
              >
                {r}x
              </button>
            ))}
          </>
        )}
        {msg && <span className="text-xs text-[--color-danger]">{msg}</span>}
      </div>
      {urls[leftId] && urls[rightId] && (
        <div className="grid grid-cols-2 gap-3">
          <div className="overflow-hidden rounded-lg bg-black">
            <video ref={lRef} src={urls[leftId]} controls playsInline muted className="max-h-[60vh] w-full" />
          </div>
          <div className="overflow-hidden rounded-lg bg-black">
            <video ref={rRef} src={urls[rightId]} controls playsInline muted className="max-h-[60vh] w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
