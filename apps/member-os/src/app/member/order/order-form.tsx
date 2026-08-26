"use client";

import { useMemo, useState } from "react";
import type { MenuItem } from "@yozan/core/frank-portal";

/**
 * モバイルオーダーのメニュー（#154）。
 * 迷わせないことを優先: カテゴリごとに並べ、±ボタンだけで数量を決める。
 * 合計は下に固定表示し、押す前に金額が見えている状態にする（決済が即時に走るため）。
 */
export function OrderForm({
  menu, priceKind, bayCode, bayName, action,
}: {
  menu: MenuItem[];
  priceKind: "general" | "member";
  bayCode: string | null;
  bayName: string | null;
  action: (formData: FormData) => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const price = (m: MenuItem) => (priceKind === "member" ? m.price_member : m.price_general);

  const groups = useMemo(() => {
    const g = new Map<string, MenuItem[]>();
    for (const m of menu) {
      if (!g.has(m.category)) g.set(m.category, []);
      g.get(m.category)!.push(m);
    }
    return [...g.entries()];
  }, [menu]);

  const total = menu.reduce((t, m) => t + price(m) * (qty[m.id] ?? 0), 0);
  const count = Object.values(qty).reduce((a, b) => a + b, 0);
  const bump = (id: string, d: number) =>
    setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(20, (q[id] ?? 0) + d)) }));

  return (
    <form action={action} className="pb-28">
      {bayCode && <input type="hidden" name="bay" value={bayCode} />}
      {menu.map((m) => (
        <input key={m.id} type="hidden" name={`q_${m.id}`} value={qty[m.id] ?? 0} />
      ))}

      {groups.map(([cat, items]) => (
        <section key={cat} className="mb-5">
          <h2 className="mb-2 text-xs font-semibold tracking-widest text-(--color-gold)">{cat}</h2>
          <div className="space-y-1.5">
            {items.map((m) => {
              const q = qty[m.id] ?? 0;
              return (
                <div
                  key={m.id}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                    q > 0 ? "border-(--color-accent)/40 bg-(--color-panel)" : "border-(--color-line) bg-(--color-panel)"
                  } ${m.sold_out ? "opacity-45" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-(--color-dim)">
                      ¥{price(m).toLocaleString("ja-JP")}
                      {m.sold_out ? " ・ 売り切れ" : priceKind === "member" ? " (会員価格)" : ""}
                    </p>
                  </div>
                  {!m.sold_out && (
                    <div className="flex shrink-0 items-center gap-2">
                      <button type="button" onClick={() => bump(m.id, -1)} disabled={q === 0}
                        className="h-9 w-9 rounded-lg border border-(--color-line) text-lg leading-none text-(--color-dim) disabled:opacity-30">−</button>
                      <span className="w-5 text-center text-sm font-semibold tabular-nums">{q}</span>
                      <button type="button" onClick={() => bump(m.id, 1)}
                        className="h-9 w-9 rounded-lg bg-accent text-lg leading-none text-white">＋</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="fixed inset-x-0 bottom-0 border-t border-(--color-line) bg-(--color-panel)/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto max-w-md">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-(--color-dim)">{bayName ? `${bayName}へお届け` : "お届け先はスタッフが確認します"}</span>
            <span className="text-lg font-bold tabular-nums">¥{total.toLocaleString("ja-JP")}</span>
          </div>
          <button
            type="submit"
            disabled={count === 0}
            className="w-full rounded-xl bg-accent py-4 text-base font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-40"
          >
            {count === 0 ? "商品を選んでください" : `${count}点を注文する`}
          </button>
          <p className="mt-1.5 text-center text-[11px] text-(--color-dim)">
            {priceKind === "member"
              ? "ご登録のカードから自動でお支払いされます"
              : "お会計は退店時に受付でお願いします"}
          </p>
        </div>
      </div>
    </form>
  );
}
