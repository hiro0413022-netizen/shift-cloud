"use client";

import { useState } from "react";
import { ticketAmountExTax } from "@yozan/core/frank-lesson-tickets";
import { withTax } from "@yozan/core/frank-tax";

/**
 * チケット購入（#199）。
 * 押す前に「何枚・いくら（税込）」が必ず見えているようにする（総額表示・frank-tax.ts）。
 * 二度押しでの二重購入を止めるため、送信中はボタンを無効にする。
 */
export function TicketBuyForm({
  unitExTax,
  unitTaxIncluded,
  packs = [],
  minutes,
  action,
}: {
  unitExTax: number;
  unitTaxIncluded: number;
  /** まとめ買い（例 4枚 税抜9,000／税込9,900）。2026-09-19 */
  packs?: { qty: number; priceExTax: number; priceTaxIncluded: number }[];
  minutes: number;
  action: (formData: FormData) => void;
}) {
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  // サーバー（purchaseTickets）と同じ計算: まとめ買いを当ててから税を足す
  const total = withTax(ticketAmountExTax(qty, unitExTax, packs.map((p) => ({ qty: p.qty, price: p.priceExTax }))));
  const plain = unitTaxIncluded * qty;

  return (
    <form action={action} onSubmit={() => setBusy(true)} className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
      <input type="hidden" name="qty" value={qty} />
      <p className="text-sm font-semibold">パーソナルレッスン {minutes}分</p>
      <p className="mt-0.5 text-xs text-(--color-dim)">
        1枚 {unitTaxIncluded.toLocaleString("ja-JP")}円（税込）
        {packs.map((p) => (
          <span key={p.qty}>
            {" ／ "}
            <span className="font-semibold text-(--color-gold)">
              {p.qty}枚 {p.priceTaxIncluded.toLocaleString("ja-JP")}円（税込）
            </span>
          </span>
        ))}
      </p>
      {packs.length > 0 && (
        <div className="mt-3 flex justify-center gap-2">
          {[1, ...packs.map((p) => p.qty)].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setQty(n)}
              className={`rounded-full border px-3 py-1 text-xs ${qty === n ? "border-(--color-gold) bg-(--color-gold) text-white" : "border-(--color-line) text-(--color-dim)"}`}
            >
              {n === 1 ? "1枚" : `${n}枚セット`}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          className="h-11 w-11 rounded-full border border-(--color-line) text-xl text-(--color-dim)"
          aria-label="1枚減らす"
        >
          −
        </button>
        <span className="min-w-16 text-center text-3xl font-bold">{qty}<span className="ml-1 text-base font-semibold">枚</span></span>
        <button
          type="button"
          onClick={() => setQty((q) => Math.min(10, q + 1))}
          className="h-11 w-11 rounded-full border border-(--color-line) text-xl text-(--color-dim)"
          aria-label="1枚増やす"
        >
          ＋
        </button>
      </div>

      <p className="mt-4 text-center text-sm">
        お支払い <span className="text-lg font-bold">{total.toLocaleString("ja-JP")}円</span>（税込）
      </p>
      {total < plain && (
        <p className="mt-1 text-center text-xs text-(--color-gold)">まとめ買いで {(plain - total).toLocaleString("ja-JP")}円 お得です</p>
      )}

      <button
        disabled={busy}
        className="mt-4 w-full rounded-xl bg-(--color-gold) py-3.5 text-center font-semibold text-white transition-colors hover:bg-(--color-gold)/90 disabled:opacity-50"
      >
        {busy ? "手続き中…" : "このチケットを購入する"}
      </button>
      <p className="mt-3 text-[11px] leading-relaxed text-(--color-dim)">
        ご登録のカードがある場合はこの場でお支払いが完了し、すぐお使いいただけます。
        カードのご登録がない場合はお申し込みのみとなり、次回ご来店時に受付でお支払いください（お支払い後にご利用いただけます）。
      </p>
    </form>
  );
}
