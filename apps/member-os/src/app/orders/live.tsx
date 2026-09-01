"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 電子伝票の自動更新と通知音（#154 → #189 で音を作り直し）
 *
 * 画面まるごとリロードせず router.refresh() で差し替える（入力中のフォームを飛ばさないため）。
 * 音は iPad Safari の制約で **一度タップしないと鳴らせない** ので「音をON」を押してもらう。
 * 押していない間は無音で更新だけ続く。
 *
 * ★ #189（2026-09-01 ユーザー指摘「音が短すぎる。もっと長く大きく」「提供済みにするまで
 *   3分たったらもう一度鳴らして」）で変えたこと:
 *   - 1回の合図を **0.35秒のピッ1回 → 約2.4秒のチャイム6連** にし、音量も上げた。
 *     厨房やラウンジで手が離せないときに、1回のピッでは気づけないため。
 *   - **未提供のまま3分たった注文を鳴らし直す**。最初の1回を聞き逃すと、
 *     以降は誰も気づけないまま伝票が残る＝いちばん困る壊れ方だった。
 *     提供済みになるまで3分ごとに繰り返す（提供済みにすれば止まる）。
 *   - 「テスト再生」を置いた。店の環境で本当に聞こえる音量かを、注文を待たずに確かめられる。
 */

/** 未提供の注文（鳴らし直しの判定に使う） */
export type LiveOrder = { id: string; orderedAt: string };

/** 鳴らし直しの間隔（ユーザー指定＝3分） */
const REMIND_MS = 3 * 60 * 1000;

export function OrdersLive({
  signature,
  unserved,
  openOrders = [],
  intervalSec = 10,
}: {
  signature: string;
  unserved: number;
  openOrders?: LiveOrder[];
  intervalSec?: number;
}) {
  const router = useRouter();
  const prev = useRef(signature);
  const ctx = useRef<AudioContext | null>(null);
  /** 注文ID → 最後に鳴らした時刻。router.refresh() では作り直されないので覚えていられる */
  const reminded = useRef<Map<string, number>>(new Map());
  const [sound, setSound] = useState(false);
  const [now, setNow] = useState("");

  /**
   * 合図の音。音声ファイルを置かずに済ませる（配信物を増やさない）。
   * 2音の繰り返しにしているのは、単音より人の耳に引っかかるため。
   * urgent（鳴らし直し）は低めの音を混ぜて、新着と聞き分けられるようにする。
   */
  const chime = useCallback((urgent = false) => {
    const ac = ctx.current;
    if (!ac) return;
    void ac.resume(); // 画面を放置していると suspended に落ちることがある
    const t0 = ac.currentTime + 0.02;
    const beat = 0.4; // 1音あたりの間隔
    const notes = urgent ? [660, 494, 660, 494, 660, 494] : [880, 1175, 880, 1175, 880, 1175];
    notes.forEach((hz, i) => {
      const at = t0 + i * beat;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "triangle"; // sine より倍音があり、同じ音量でも通る
      osc.frequency.value = hz;
      osc.connect(gain);
      gain.connect(ac.destination);
      // 0.25 → 0.9（ユーザー指摘「もっと大きく」）。歪まないよう立ち上がりは滑らかに
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.9, at + 0.03);
      gain.gain.setValueAtTime(0.9, at + 0.22);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
      osc.start(at);
      osc.stop(at + 0.36);
    });
  }, []);

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

  // 音をONにしていない/別タブを見ているときの保険。タブの見出しで未提供件数が分かる
  useEffect(() => {
    document.title = unserved > 0 ? `(${unserved}) 電子伝票 — FRANK GOLF` : "電子伝票 — FRANK GOLF";
  }, [unserved]);

  // 新しい注文が入った
  useEffect(() => {
    if (prev.current === signature) return;
    prev.current = signature;
    chime(false);
  }, [signature, chime]);

  /**
   * 未提供のまま3分たった注文を鳴らし直す。
   * 判定は自前のタイマーで回す（router.refresh() を待つと最大10秒ずれるため）。
   * 提供済み・取消になった注文は openOrders から消えるので、覚えている時刻も掃除する。
   */
  useEffect(() => {
    if (!sound) return;
    const check = () => {
      const t = Date.now();
      const alive = new Set(openOrders.map((o) => o.id));
      for (const id of reminded.current.keys()) if (!alive.has(id)) reminded.current.delete(id);

      let ring = false;
      for (const o of openOrders) {
        const at = Date.parse(o.orderedAt);
        if (Number.isNaN(at)) continue;
        const last = reminded.current.get(o.id) ?? at; // 未通知なら注文時刻を起点にする
        if (t - last >= REMIND_MS) {
          reminded.current.set(o.id, t);
          ring = true;
        }
      }
      // 何件たまっていても鳴らすのは1回（連打すると誰も聞かなくなる）
      if (ring) chime(true);
    };
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, [openOrders, sound, chime]);

  const enable = () => {
    type W = typeof window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext ?? (window as W).webkitAudioContext;
    if (!Ctor) return;
    ctx.current = new Ctor();
    void ctx.current.resume();
    setSound(true);
    chime(false); // ONにした瞬間に1回鳴らす＝音量をその場で確かめられる
  };

  return (
    <div className="flex items-center gap-3 text-sm text-(--color-dim)">
      <span className="tabular-nums">{now}</span>
      {sound ? (
        <>
          <span className="text-(--color-accent)">🔔 音ON</span>
          <button
            onClick={() => chime(false)}
            className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-xs"
          >
            テスト再生
          </button>
        </>
      ) : (
        <button onClick={enable} className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-xs">
          音をONにする
        </button>
      )}
    </div>
  );
}
