"use client";

import { useState, useTransition } from "react";
import { placeOrder } from "@/app/q/[id]/flow-actions";
import { GOLFWING_POOL_URL, golfwingOrderUrl } from "@/lib/links";
import type { PlaceOrderResult } from "@/lib/place-order";

/**
 * 【発注する】→ 発注管理のオーダー用紙（発注1件の画面）を別タブで開く。
 *
 * ポップアップを止められないよう、押した瞬間に空のタブを開いておき、
 * サーバーの処理（発注プールへの作成）が終わってから行き先を入れる。
 * 仕入先が2社以上に分かれたときは、発注プール（仕入先ごとにまとめて送る画面）を開く。
 */
export function OrderButton({
  quoteId,
  label = "発注する（発注管理へ）",
  className,
}: {
  quoteId: number;
  label?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PlaceOrderResult | null>(null);

  function go() {
    const tab = window.open("about:blank", "_blank");
    start(async () => {
      try {
        const r = await placeOrder(quoteId);
        setResult(r);
        const url = r.orders.length === 1 ? golfwingOrderUrl(r.orders[0].id) : r.orders.length > 1 ? GOLFWING_POOL_URL : null;
        if (tab && url) tab.location.href = url;
        else tab?.close();
      } catch (e) {
        tab?.close();
        setResult({ ok: false, message: e instanceof Error ? e.message : "発注できませんでした", orders: [], skipped: [], already: false });
      }
    });
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className={
          className ??
          "inline-flex items-center gap-2 rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--color-accent-2) disabled:opacity-50"
        }
      >
        {pending ? "発注管理に送っています…" : label}
      </button>
      {result && (
        <div className="max-w-md text-xs">
          {result.message && <p className="text-red-600">{result.message}</p>}
          {result.orders.length > 0 && (
            <p className="text-(--color-ok)">
              {result.already ? "すでに発注管理にあります：" : "発注管理の発注プールに入れました："}
              {result.orders.map((o) => (
                <a key={o.id} href={golfwingOrderUrl(o.id)} target="_blank" rel="noreferrer" className="ml-2 underline">
                  {o.supplier ?? o.orderNo}
                </a>
              ))}
            </p>
          )}
          {result.skipped.length > 0 && (
            <div className="mt-1 rounded border border-amber-300 bg-amber-50 p-2 text-amber-800">
              発注管理に載せられなかった明細（発注管理で手で入れてください）
              <ul className="mt-1 list-disc pl-4">
                {result.skipped.map((s, i) => (
                  <li key={i}>
                    {s.manufacturer ? `${s.manufacturer} ` : ""}
                    {s.product_name} — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
