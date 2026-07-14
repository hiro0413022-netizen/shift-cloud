"use client";

// 見積作成UI: プラン＋オプションを選ぶと合計が即時に出る（面談中にその場で金額を提示するため）。
// 送信時は items をJSONにしてサーバーアクションへ渡す（金額はサーバー側でマスタから再計算＝改ざん不可）。

import { useMemo, useState } from "react";
import { calcQuote, yen, OPTION_CATEGORIES, type QuoteItem } from "@/lib/quote";
import { inputCls, btnCls } from "./ui";

export type PlanRow = { key: string; name: string; build_price: number; monthly_fee: number; pages: string | null };
export type OptionRow = {
  key: string;
  name: string;
  category: string;
  description: string | null;
  build_price: number;
  monthly_fee: number;
  unit: string;
  default_qty: number;
  recommended: boolean;
};

export function QuoteBuilder({
  action,
  plans,
  options,
  taxRate,
  validDays,
  defaultPlanKey,
  defaultSelected,
}: {
  action: (fd: FormData) => void;
  plans: PlanRow[];
  options: OptionRow[];
  taxRate: number;
  validDays: number;
  defaultPlanKey?: string | null;
  defaultSelected?: Record<string, number>; // key -> qty（前回見積の引き継ぎ）
}) {
  const [planKey, setPlanKey] = useState(defaultPlanKey || plans[0]?.key || "");
  const [sel, setSel] = useState<Record<string, number>>(
    defaultSelected ??
      Object.fromEntries(options.filter((o) => o.recommended).map((o) => [o.key, o.default_qty]))
  );
  const [discountBuild, setDiscountBuild] = useState(0);
  const [discountMonthly, setDiscountMonthly] = useState(0);

  const plan = plans.find((p) => p.key === planKey) ?? null;
  const items: QuoteItem[] = useMemo(
    () =>
      options
        .filter((o) => sel[o.key] > 0)
        .map((o) => ({
          key: o.key,
          name: o.name,
          unit: o.unit,
          qty: sel[o.key],
          build: o.build_price,
          monthly: o.monthly_fee,
          description: o.description ?? undefined,
        })),
    [options, sel]
  );

  const totals = calcQuote({
    planName: plan?.name ?? null,
    planBuild: plan?.build_price ?? 0,
    planMonthly: plan?.monthly_fee ?? 0,
    items,
    discountBuild,
    discountMonthly,
    taxRate,
  });

  const toggle = (o: OptionRow) =>
    setSel((s) => {
      const n = { ...s };
      if (n[o.key]) delete n[o.key];
      else n[o.key] = o.default_qty || 1;
      return n;
    });

  const grouped = Object.keys(OPTION_CATEGORIES)
    .map((c) => ({ cat: c, list: options.filter((o) => o.category === c) }))
    .filter((g) => g.list.length > 0);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="items" value={JSON.stringify(items.map((i) => ({ key: i.key, qty: i.qty })))} />
      <input type="hidden" name="planKey" value={planKey} />

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-(--color-dim)">基本プラン
          <select value={planKey} onChange={(e) => setPlanKey(e.target.value)} className={inputCls}>
            <option value="">（プランなし・オプションのみ）</option>
            {plans.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}（{yen(p.build_price)}＋{yen(p.monthly_fee)}/月）
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-(--color-dim)">値引き（初期費用・税抜）
          <input
            name="discountBuild"
            value={discountBuild || ""}
            onChange={(e) => setDiscountBuild(Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
            placeholder="0"
            className={inputCls}
          />
        </label>
        <label className="text-xs text-(--color-dim)">値引き（月額・税抜）
          <input
            name="discountMonthly"
            value={discountMonthly || ""}
            onChange={(e) => setDiscountMonthly(Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
            placeholder="0"
            className={inputCls}
          />
        </label>
      </div>

      <div className="grid gap-3">
        {grouped.map((g) => (
          <div key={g.cat}>
            <p className="mb-1 text-xs font-semibold text-(--color-dim)">{OPTION_CATEGORIES[g.cat]}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {g.list.map((o) => {
                const on = !!sel[o.key];
                return (
                  <div
                    key={o.key}
                    className={`rounded-lg border p-3 text-sm ${on ? "border-(--color-accent) bg-(--color-panel-2)" : "border-(--color-line)"}`}
                  >
                    <label className="flex cursor-pointer items-start gap-2">
                      <input type="checkbox" checked={on} onChange={() => toggle(o)} className="mt-1" />
                      <span className="flex-1">
                        <span className="font-medium">{o.name}</span>
                        <span className="ml-2 text-xs text-(--color-dim)">
                          {o.build_price ? yen(o.build_price) : ""}
                          {o.build_price && o.monthly_fee ? " ＋ " : ""}
                          {o.monthly_fee ? `${yen(o.monthly_fee)}/月` : ""}
                        </span>
                        {o.description && <span className="block text-xs text-(--color-dim)">{o.description}</span>}
                      </span>
                    </label>
                    {on && (
                      <div className="mt-2 flex items-center gap-2 text-xs text-(--color-dim)">
                        数量
                        <input
                          value={sel[o.key]}
                          onChange={(e) =>
                            setSel((s) => ({ ...s, [o.key]: Math.max(1, Number(e.target.value.replace(/[^\d]/g, "")) || 1) }))
                          }
                          className={`${inputCls} w-20 px-2 py-1`}
                        />
                        {o.unit}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 合計（即時計算） */}
      <div className="grid gap-2 rounded-xl border border-(--color-accent) bg-(--color-panel-2) p-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-(--color-dim)">初期費用</p>
          <p className="text-xl font-bold">{yen(totals.totalBuild)}<span className="ml-1 text-xs font-normal text-(--color-dim)">税込</span></p>
          <p className="text-xs text-(--color-dim)">税抜 {yen(totals.netBuild)}／消費税 {yen(totals.taxBuild)}</p>
        </div>
        <div>
          <p className="text-xs text-(--color-dim)">月額</p>
          <p className="text-xl font-bold">{yen(totals.totalMonthly)}<span className="ml-1 text-xs font-normal text-(--color-dim)">税込/月</span></p>
          <p className="text-xs text-(--color-dim)">税抜 {yen(totals.netMonthly)}／消費税 {yen(totals.taxMonthly)}</p>
        </div>
        <div className="sm:col-span-2 border-t border-(--color-line) pt-2 text-xs text-(--color-dim)">
          ご契約時のお支払い（初期＋初月）: <b className="text-(--color-txt)">{yen(totals.firstPayment)}</b>
          　／　初年度合計: <b className="text-(--color-txt)">{yen(totals.yearOne)}</b>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-(--color-dim)">有効期限（日）
          <input name="validDays" defaultValue={validDays} className={inputCls} />
        </label>
        <label className="text-xs text-(--color-dim) sm:col-span-2">備考（見積書に載ります）
          <input name="note" placeholder="例: 写真撮影は院の休診日に実施" className={inputCls} />
        </label>
      </div>

      <button className={`${btnCls} w-fit`}>この内容で見積書を作成</button>
    </form>
  );
}
