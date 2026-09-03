"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChime } from "@/components/chime";
import { pickNew, type LiveItem } from "@/lib/live-feed-pure";

/**
 * 電子伝票の自動更新と通知音（#154 → #189 で音を作り直し）
 *
 * 画面まるごとリロードせず router.refresh() で差し替える（入力中のフォームを飛ばさないため）。
 *
 * ★ #196（2026-09-01 ユーザー依頼「電子伝票の画面で最初から音オンにしておいて」）
 *   音は **最初からON** にする。開いた瞬間に AudioContext を作って resume() を試み、
 *   画面上の表示も最初から「🔔 音ON」。
 *   ⚠ ただし iPad Safari / Chrome は **一度も操作していないページで音を鳴らせない**（自動再生の制限）。
 *   これはこちらの設定では外せないので、鳴らせない間は
 *     ・帯で「画面を一度タップすると音が鳴ります」と出す（小さなボタンを探させない）
 *     ・**画面のどこを触っても**（伝票を押しても・スクロールしても）音が使えるようになる
 *   ようにした。開店時に一度触れば、その日はもう意識しないで済む。
 *   「押していないから鳴らない」を、店の人が気づけない形で放置しないのが目的。
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
  items = [],
}: {
  signature: string;
  unserved: number;
  openOrders?: LiveOrder[];
  intervalSec?: number;
  /** 未提供の注文（新しい順）。鳴った理由をこの中から出す（#202） */
  items?: LiveItem[];
}) {
  const router = useRouter();
  const prev = useRef(signature);
  /** 注文ID → 最後に鳴らした時刻。router.refresh() では作り直されないので覚えていられる */
  const reminded = useRef<Map<string, number>>(new Map());
  // 音の面倒（自動再生の制限・どこを触っても復帰・状態表示）は共通フックが持つ（#197で共通化）
  const { sound, setSound, ready, chime, arm } = useChime(true);
  const [now, setNow] = useState("");
  /* 鳴った理由（#202・2026-09-03 ユーザー依頼）。
     伝票カードは下に並んでいるが、**鳴った瞬間に「どこへ・何を」だけ**読めたほうが速い。
     見逃してもいいように直近5件は残す。 */
  const [notices, setNotices] = useState<Array<{ key: string; text: string; at: string }>>([]);
  const seen = useRef<Set<string>>(new Set());

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

  // 開いた時点で並んでいる注文は「新着」ではない
  useEffect(() => {
    for (const i of items) seen.current.add(i.key);
    // 初回だけ。以降は signature の変化で拾う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 新しい注文が入った
  useEffect(() => {
    if (prev.current === signature) return;
    prev.current = signature;
    const fresh = pickNew(items, seen.current);
    if (fresh.length > 0) {
      const d = new Date();
      const stamp = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      for (const f of fresh) seen.current.add(f.key);
      setNotices((p) => [...fresh.map((f) => ({ key: f.key, text: f.text, at: stamp })).reverse(), ...p].slice(0, 5));
    }
    if (sound && ready) chime("new");
  }, [signature, chime, sound, ready, items]);

  /**
   * 未提供のまま3分たった注文を鳴らし直す。
   * 判定は自前のタイマーで回す（router.refresh() を待つと最大10秒ずれるため）。
   * 提供済み・取消になった注文は openOrders から消えるので、覚えている時刻も掃除する。
   */
  useEffect(() => {
    if (!sound || !ready) return;
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
      if (ring) chime("urgent");
    };
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, [openOrders, sound, ready, chime]);

  return (
    <div className="flex flex-col items-end gap-2">
    <div className="flex items-center gap-3 text-sm text-(--color-dim)">
      <span className="tabular-nums">{now}</span>
      {!sound ? (
        <button
          onClick={() => { setSound(true); arm(true); }}
          className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-xs"
        >
          音をONにする
        </button>
      ) : ready ? (
        <>
          <span className="text-(--color-accent)">🔔 音ON</span>
          <button
            onClick={() => chime("new")}
            className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-xs"
          >
            テスト再生
          </button>
          <button
            onClick={() => setSound(false)}
            className="text-xs text-(--color-dim) underline"
            title="この画面を閉じるまで音を止めます"
          >
            音を止める
          </button>
        </>
      ) : (
        // ブラウザの自動再生制限で、まだ鳴らせない状態。
        // 小さなボタンではなく帯で出す（気づかないまま無音で営業するのがいちばん困る）
        <button
          onClick={() => arm(true)}
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800"
        >
          🔔 画面を一度タップすると音が鳴ります
        </button>
      )}
    </div>

    {/* 鳴った理由（#202）。いちばん上が最新。見逃してもここに残る */}
    {notices.length > 0 && (
      <ul className="w-full max-w-md space-y-1">
        {notices.map((x, i) => (
          <li
            key={x.key}
            className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
              i === 0
                ? "border-emerald-300 bg-emerald-50 font-semibold text-emerald-800"
                : "border-(--color-line) bg-white text-(--color-dim)"
            }`}
          >
            <span aria-hidden>🔔</span>
            <span className="flex-1 text-left">{x.text}</span>
            <span className="shrink-0 tabular-nums">{x.at}</span>
          </li>
        ))}
        <li className="text-right">
          <button onClick={() => setNotices([])} className="text-[11px] text-(--color-dim) underline">
            確認したので消す
          </button>
        </li>
      </ul>
    )}
    </div>
  );
}
