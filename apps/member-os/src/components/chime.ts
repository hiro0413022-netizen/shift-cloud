"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 店頭の合図音（#189で作り、#196で「最初からON」に、#197で予約画面にも使えるよう共通化）
 *
 * ★ 音声ファイルを置かずに WebAudio で鳴らす（配信物を増やさない・読み込み待ちがない）。
 * ★ 2音の繰り返しにしているのは、単音より人の耳に引っかかるため。
 *
 * ⚠ ブラウザの決まりで「一度も操作していないページ」では音を鳴らせない（自動再生の制限）。
 *   こちらの設定では外せないので、
 *     - 開いた瞬間に resume() を試す
 *     - ダメなら **画面のどこを触っても** もう一度 resume() する
 *   の2段構えにしてある。開店時に一度触れば、その日はもう意識しなくてよい。
 *   「押していないから鳴らない」を、店の人が気づけない形で放置しないのが目的。
 */
export type ChimeKind = "new" | "urgent";

export function useChime(enabledByDefault = true) {
  const ctx = useRef<AudioContext | null>(null);
  const [sound, setSound] = useState(enabledByDefault);
  /** ブラウザが実際に鳴らせる状態か（AudioContext が running）。false の間は無音 */
  const [ready, setReady] = useState(false);

  const chime = useCallback((kind: ChimeKind = "new") => {
    const ac = ctx.current;
    if (!ac) return;
    void ac.resume(); // 画面を放置していると suspended に落ちることがある
    const t0 = ac.currentTime + 0.02;
    const beat = 0.4; // 1音あたりの間隔
    // urgent（鳴らし直し）は低めの音にして、新着と聞き分けられるようにする
    const notes = kind === "urgent" ? [660, 494, 660, 494, 660, 494] : [880, 1175, 880, 1175, 880, 1175];
    notes.forEach((hz, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "triangle"; // sine より倍音があり、同じ音量でも通る
      osc.frequency.value = hz;
      const s = t0 + i * beat;
      gain.gain.setValueAtTime(0.0001, s);
      gain.gain.exponentialRampToValueAtTime(0.9, s + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, s + beat * 0.9);
      osc.connect(gain).connect(ac.destination);
      osc.start(s);
      osc.stop(s + beat);
    });
  }, []);

  /** AudioContext を用意して鳴らせるようにする。何度呼んでも作り直さない */
  const arm = useCallback(
    (withTestTone: boolean) => {
      type W = typeof window & { webkitAudioContext?: typeof AudioContext };
      const Ctor = window.AudioContext ?? (window as W).webkitAudioContext;
      if (!Ctor) return;
      if (!ctx.current) {
        ctx.current = new Ctor();
        ctx.current.onstatechange = () => setReady(ctx.current?.state === "running");
      }
      const ac = ctx.current;
      void ac.resume().then(() => {
        setReady(ac.state === "running");
        if (withTestTone && ac.state === "running") chime("new");
      });
      setReady(ac.state === "running");
    },
    [chime],
  );

  useEffect(() => {
    arm(false);
    const unlock = () => arm(false);
    const opts = { passive: true } as AddEventListenerOptions;
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("touchstart", unlock, opts);
    window.addEventListener("keydown", unlock);
    const onVis = () => {
      if (document.visibilityState === "visible") arm(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [arm]);

  return { sound, setSound, ready, chime, arm };
}
