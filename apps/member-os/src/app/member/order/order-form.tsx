"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { MenuItem } from "@yozan/core/frank-portal";
import { taxOf, withTax } from "@yozan/core/frank-tax";

/**
 * モバイルオーダーのメニュー（#154）。
 * 迷わせないことを優先: カテゴリごとに並べ、±ボタンだけで数量を決める。
 * 合計は下に固定表示し、押す前に金額が見えている状態にする（決済が即時に走るため）。
 *
 * 金額表示は **税込を主**にする（#166）。
 * メニューの price_* は税抜の本体価格だが、お客様に見せる値段は総額でなければならない
 * （総額表示義務・消費税法63条）。税抜だけを大きく出す表示に戻さないこと。
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
  /** 税抜の本体価格（DBの値） */
  const net = (m: MenuItem) => (priceKind === "member" ? m.price_member : m.price_general);
  /** お客様に見せる値段＝税込 */
  const price = (m: MenuItem) => withTax(net(m));

  const groups = useMemo(() => {
    const g = new Map<string, MenuItem[]>();
    for (const m of menu) {
      if (!g.has(m.category)) g.set(m.category, []);
      g.get(m.category)!.push(m);
    }
    return [...g.entries()];
  }, [menu]);

  // 税は品目ごとではなく税抜合計に1回だけかける（サーバー側 buildOrderLines と同じ計算）
  const subtotal = menu.reduce((t, m) => t + net(m) * (qty[m.id] ?? 0), 0);
  const tax = taxOf(subtotal);
  const total = subtotal + tax;
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
                      <span className="opacity-70">（税込）</span>
                      {m.sold_out ? " ・ 売り切れ" : priceKind === "member" ? " ・会員価格" : ""}
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
            <span className="text-right">
              <span className="text-lg font-bold tabular-nums">¥{total.toLocaleString("ja-JP")}</span>
              {subtotal > 0 && (
                <span className="ml-1.5 text-[11px] text-(--color-dim) tabular-nums">
                  （税抜 ¥{subtotal.toLocaleString("ja-JP")} ＋ 消費税 ¥{tax.toLocaleString("ja-JP")}）
                </span>
              )}
            </span>
          </div>
          <SubmitButton count={count} />
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

/**
 * 送信ボタン（#155）
 *
 * ★ 二度押しを必ず止める。 会員の注文はその場でカードに課金が走るので、
 *   連打すると **注文も決済も2件**できてしまう（Square側の idempotency_key は
 *   注文IDごとなので、注文が2件になれば別々に通る）。
 */
function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={count === 0 || pending}
      className="w-full rounded-xl bg-accent py-4 text-base font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-40"
    >
      {pending ? "送信しています…" : count === 0 ? "商品を選んでください" : `${count}点を注文する`}
    </button>
  );
}
