"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChime } from "./chime";
import { pickNew, type LiveItem } from "@/lib/live-feed-pure";

/**
 * 画面をひとりでに最新にする（#197・2026-09-01 ユーザー指摘）
 *
 * ★ なぜ要るか
 *   予約はお客様が24時間いつでも入れられる。スタッフがリロードを押すまで画面に出ないと、
 *   **入っている予約に気づかないまま当日を迎える**。押し忘れは必ず起きるので、
 *   「押さなくても出る」側に変える。
 *
 * ★ やり方
 *   画面まるごとリロードせず router.refresh() でサーバー側だけ取り直す
 *   （入力中のフォームやスクロール位置を飛ばさない）。
 *   signature はサーバーが作る「いまの状態を表す文字列」で、これが変わったら中身が変わった合図。
 *
 * ★ 気をつけたこと
 *   - **別のタブを見ている間は止める**（無駄な問い合わせを増やさない）。
 *     戻ってきた瞬間に1回取り直すので、開きっぱなしでも最新から始まる。
 *   - 変わったときだけ「新着」を出し、音を鳴らす。毎回鳴らすと誰も聞かなくなる。
 *   - 最初の描画では鳴らさない（開いた瞬間に鳴るのは事故に見える）。
 *   - 最終更新の時刻を出す。**画面が止まっていないことが目で分かる**ようにしておかないと、
 *     「本当に更新されているのか」を確かめるためにリロードを押すことになる。
 *
 * ★ #202（2026-09-03 ユーザー依頼「音が鳴るのはいいが、それが何の内容なのか通知して」）
 *   鳴った理由を1行で出す（「体験 ／ 9/5(土) 13:00 ／ 岸田 拓也 様 ／ C打席」）。
 *   **直近5件は消さずに残す**——手が離せなくて見逃しても、あとから読み返せるように。
 *   何が届いたか分からない通知は、そのうち誰も見なくなる。
 */
export function LiveRefresh({
  signature,
  intervalSec = 15,
  label = "新しい予約が入りました",
  withSound = true,
  items = [],
}: {
  /** サーバーが作る「いまの状態」を表す文字列。変わったら中身が変わった合図 */
  signature: string;
  intervalSec?: number;
  label?: string;
  withSound?: boolean;
  /** 直近で動いたもの（新しい順）。鳴った理由をこの中から出す（#202） */
  items?: LiveItem[];
}) {
  const router = useRouter();
  const prev = useRef(signature);
  const first = useRef(true);
  const { sound, setSound, ready, chime, arm } = useChime(withSound);
  const [changedAt, setChangedAt] = useState<string>("");
  const [now, setNow] = useState("");
  /** 出した知らせ（新しい順・最大5件）。見逃してもあとから読めるように消さない */
  const [notices, setNotices] = useState<Array<{ key: string; text: string; at: string }>>([]);
  const seen = useRef<Set<string>>(new Set());

  const hhmmss = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;

  // 定期的に取り直す（別タブを見ている間は止める）
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      setNow(hhmmss(new Date()));
    };
    tick();
    const id = setInterval(tick, Math.max(5, intervalSec) * 1000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [router, intervalSec]);

  // 中身が変わったときだけ知らせる
  useEffect(() => {
    if (prev.current === signature) return;
    prev.current = signature;
    if (first.current) {
      first.current = false;
      return; // 開いた直後は鳴らさない
    }
    setChangedAt(hhmmss(new Date()));
    // 何が届いたのかを出す（#202）。まだ出していないものだけ
    const fresh = pickNew(items, seen.current);
    if (fresh.length > 0) {
      const stamp = hhmmss(new Date());
      for (const f of fresh) seen.current.add(f.key);
      setNotices((prev) => [...fresh.map((f) => ({ key: f.key, text: f.text, at: stamp })).reverse(), ...prev].slice(0, 5));
    }
    if (sound && ready) chime("new");
  }, [signature, sound, ready, chime, items]);

  // 開いた時点で見えているものは「新着」ではない（開いた瞬間に大量に出さない）
  useEffect(() => {
    for (const i of items) seen.current.add(i.key);
    first.current = false;
    // 初回だけ。以降は signature の変化で拾う
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-1.5">
    <div className="flex flex-wrap items-center gap-2 text-xs text-(--color-dim)">
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
        自動更新中{now ? `（最終 ${now}）` : ""}
      </span>
      {changedAt && notices.length === 0 && (
        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
          🔔 {label}（{changedAt}）
        </span>
      )}
      {!withSound ? null : !sound ? (
        <button onClick={() => { setSound(true); arm(true); }} className="underline">
          音をONにする
        </button>
      ) : ready ? (
        <>
          <span className="text-(--color-accent)">🔔 音ON</span>
          <button onClick={() => chime("new")} className="underline">テスト再生</button>
          <button onClick={() => setSound(false)} className="underline" title="この画面を閉じるまで音を止めます">
            音を止める
          </button>
        </>
      ) : (
        // ブラウザの自動再生制限で、まだ鳴らせない状態。気づかないまま無音にしない
        <button
          onClick={() => arm(true)}
          className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800"
        >
          🔔 画面を一度クリックすると音が鳴ります
        </button>
      )}
    </div>

    {/* 鳴った理由（#202）。いちばん上が最新。見逃してもここに残る */}
    {notices.length > 0 && (
      <ul className="space-y-1">
        {notices.map((n, i) => (
          <li
            key={n.key}
            className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
              i === 0
                ? "border-emerald-300 bg-emerald-50 font-semibold text-emerald-800"
                : "border-(--color-line) bg-white/60 text-(--color-dim)"
            }`}
          >
            <span aria-hidden>🔔</span>
            <span className="flex-1">{n.text}</span>
            <span className="shrink-0 tabular-nums">{n.at}</span>
          </li>
        ))}
        <li className="pt-0.5">
          <button onClick={() => setNotices([])} className="text-[11px] text-(--color-dim) underline">
            確認したので消す
          </button>
        </li>
      </ul>
    )}
    </div>
  );
}
