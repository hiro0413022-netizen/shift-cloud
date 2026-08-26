"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * 会員証QR ⇄ 来店中モード の自動切替（#154）
 *
 * 狙い（構想 §5-2）: 受付でQRをかざす → 顔を上げる → 手元の画面がもう変わっている。
 * お客様に操作をさせない。この切替が「スマホを開く → 注文する」を1つの動作につなぐ。
 *
 * 実装は素朴なポーリング。WebSocket も Push も使わないのは、
 * 見ているのが「かざした直後の数秒」だけで、画面を閉じれば止まってよいため。
 */
export type Visit = {
  checkedIn: boolean;
  bayName: string | null;
  bayCode: string | null;
  endTime: string | null;
};

export function VisitPanel({ initial, qrDataUrl, token }: { initial: Visit; qrDataUrl: string | null; token: string | null }) {
  const [visit, setVisit] = useState<Visit>(initial);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/member/visit", { cache: "no-store" });
        if (!res.ok || !alive) return;
        setVisit((await res.json()) as Visit);
      } catch {
        /* 電波が切れているだけ。次の周期で拾う */
      }
    };
    // 未チェックインのときは短く（かざした瞬間に切り替えたい）、来店中は長くて十分
    const id = setInterval(tick, visit.checkedIn ? 30_000 : 4_000);
    const onVis = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [visit.checkedIn]);

  if (visit.checkedIn) {
    return (
      <section className="mb-6 rounded-2xl border border-(--color-accent)/25 bg-(--color-panel) p-5 text-center shadow-sm">
        <p className="text-sm font-semibold text-(--color-accent)">✓ チェックインしました</p>
        <p className="mt-1 text-2xl font-bold tracking-wide">
          {visit.bayName ?? "打席をご案内します"}
        </p>
        {visit.endTime && <p className="text-xs text-(--color-dim)">{visit.endTime} まで</p>}
        {!visit.bayName && (
          <p className="mt-1 text-xs text-(--color-dim)">スタッフが打席をご案内します</p>
        )}
        <Link
          href={visit.bayCode ? `/member/order?bay=${encodeURIComponent(visit.bayCode)}` : "/member/order"}
          className="mt-4 block w-full rounded-xl bg-accent py-4 text-lg font-semibold text-white transition-colors hover:bg-accent/90"
        >
          {visit.bayName ? `${visit.bayName}から注文する` : "注文する"}
        </Link>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-2xl border border-(--color-line) bg-(--color-panel) p-5 text-center shadow-sm">
      <p className="mb-3 text-sm font-semibold text-(--color-dim)">受付のリーダーにかざしてください</p>
      {qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qrDataUrl} alt="会員証QRコード" className="mx-auto h-auto w-full max-w-[260px] rounded-xl bg-white p-2" />
      ) : (
        <p className="py-10 text-sm text-(--color-dim)">会員証を準備できませんでした。スタッフにお声がけください</p>
      )}
      {token && (
        // リーダーが故障したとき、スタッフがこの文字を受付画面に打ち込めば同じことができる
        <p className="mt-2 font-mono text-[11px] tracking-widest text-(--color-dim)">{token.replace(/(.{4})/g, "$1 ").trim()}</p>
      )}
    </section>
  );
}
