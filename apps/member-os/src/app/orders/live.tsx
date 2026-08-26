"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 電子伝票の自動更新と通知音（#154）
 *
 * 画面まるごとリロードせず router.refresh() で差し替える（入力中のフォームを飛ばさないため）。
 * 音は iPad Safari の制約で **一度タップしないと鳴らせない** ので、
 * 「音をON」を押してもらう。押していない間は無音で更新だけ続く。
 * 取りこぼし対策として、公式LINEのスタッフ通知も別途走らせる想定（構想 §4）。
 */
export function OrdersLive({ signature, intervalSec = 10 }: { signature: string; intervalSec?: number }) {
  const router = useRouter();
  const prev = useRef(signature);
  const ctx = useRef<AudioContext | null>(null);
  const [sound, setSound] = useState(false);
  const [now, setNow] = useState("");

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalSec * 1000);
    return () => clearInterval(id);
  }, [router, intervalSec]);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (prev.current === signature) return;
    prev.current = signature;
    const ac = ctx.current;
    if (!ac) return;
    // 短いピッという合図。音声ファイルを置かずに済ませる
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain); gain.connect(ac.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35);
    osc.start(); osc.stop(ac.currentTime + 0.36);
  }, [signature]);

  const enable = () => {
    type W = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? (window as W).webkitAudioContext;
    if (!Ctor) return;
    ctx.current = new Ctor();
    void ctx.current.resume();
    setSound(true);
  };

  return (
    <div className="flex items-center gap-3 text-sm text-(--color-dim)">
      <span className="tabular-nums">{now}</span>
      {sound ? (
        <span className="text-(--color-accent)">🔔 音ON</span>
      ) : (
        <button onClick={enable} className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-xs">
          音をONにする
        </button>
      )}
    </div>
  );
}
