"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChime } from "./chime";

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
 */
export function LiveRefresh({
  signature,
  intervalSec = 15,
  label = "新しい予約が入りました",
  withSound = true,
}: {
  /** サーバーが作る「いまの状態」を表す文字列。変わったら中身が変わった合図 */
  signature: string;
  intervalSec?: number;
  label?: string;
  withSound?: boolean;
}) {
  const router = useRouter();
  const prev = useRef(signature);
  const first = useRef(true);
  const { sound, setSound, ready, chime, arm } = useChime(withSound);
  const [changedAt, setChangedAt] = useState<string>("");
  const [now, setNow] = useState("");

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
    if (sound && ready) chime("new");
  }, [signature, sound, ready, chime]);

  useEffect(() => {
    first.current = false;
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-(--color-dim)">
      <span className="inline-flex items-center gap-1">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
        自動更新中{now ? `（最終 ${now}）` : ""}
      </span>
      {changedAt && (
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
  );
}
