"use client";

import { useState } from "react";
import { addItem } from "./actions";
import { Avatar, btnGhostCls } from "@/components/ui";

type Cast = { id: string; displayName: string };
type Drink = { id: string; label: string; price: number; backKind: "fixed" | "percent"; backValue: number };
type Tier = { id: string; label: string; minAmount: number; maxAmount: number | null; percent: number };

type Tab = "cast_drink" | "bottle" | "nomination" | "extend";

/**
 * 伝票への追加。ボーイが迷わないよう「タグ → 種類 → 誰の分か」の順に固定する。
 * 誰の分かを選ぶまで確定ボタンを押せない（あとで担当不明の行を作らせない）。
 */
export function AddPanel({
  slipId,
  casts,
  drinks,
  tiers,
  prices,
  nominationBack,
}: {
  slipId: string;
  casts: Cast[];
  drinks: Drink[];
  tiers: Tier[];
  prices: { nomination: number; inhouseNomination: number; douhan: number; extendPerGuest: number; extendMinutes: number };
  nominationBack: { nomination: number; inhouseNomination: number; douhan: number };
}) {
  const [tab, setTab] = useState<Tab>("cast_drink");
  const [drinkId, setDrinkId] = useState(drinks[0]?.id ?? "");
  const [nomKind, setNomKind] = useState<"nomination" | "inhouse_nomination" | "douhan">("nomination");
  const [castId, setCastId] = useState("");
  const [qty, setQty] = useState(1);
  const [bottleLabel, setBottleLabel] = useState("");
  const [bottleAmount, setBottleAmount] = useState(0);

  const drink = drinks.find((d) => d.id === drinkId);
  const tier = tiers.find((t) => bottleAmount >= t.minAmount && (t.maxAmount == null || bottleAmount < t.maxAmount));

  const preview = (() => {
    if (tab === "cast_drink" && drink) {
      const amount = drink.price * qty;
      const back = drink.backKind === "fixed" ? drink.backValue * qty : Math.floor((amount * drink.backValue) / 100);
      return { amount, back, note: drink.backKind === "fixed" ? `1杯 ¥${drink.backValue.toLocaleString()}` : `${drink.backValue}%` };
    }
    if (tab === "bottle") {
      const back = tier ? Math.floor((bottleAmount * tier.percent) / 100) : 0;
      return { amount: bottleAmount, back, note: tier ? `${tier.label} ${tier.percent}%` : "価格を入れてください" };
    }
    if (tab === "nomination") {
      const price = nomKind === "nomination" ? prices.nomination : nomKind === "inhouse_nomination" ? prices.inhouseNomination : prices.douhan;
      const back =
        nomKind === "nomination"
          ? nominationBack.nomination
          : nomKind === "inhouse_nomination"
            ? nominationBack.inhouseNomination
            : nominationBack.douhan;
      return { amount: price * qty, back: back * qty, note: `1本 ¥${back.toLocaleString()}` };
    }
    return { amount: prices.extendPerGuest * qty, back: 0, note: `${prices.extendMinutes}分 × ${qty}` };
  })();

  const needsCast = tab !== "extend";
  const canSubmit =
    (!needsCast || !!castId) && (tab !== "bottle" || (bottleAmount > 0 && bottleLabel.trim() !== ""));

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "cast_drink", label: "ドリンク" },
    { key: "bottle", label: "ボトル" },
    { key: "nomination", label: "指名・同伴" },
    { key: "extend", label: "延長" },
  ];

  return (
    <form action={addItem} className="flex flex-col gap-3">
      <input type="hidden" name="slipId" value={slipId} />
      <input type="hidden" name="kind" value={tab === "nomination" ? nomKind : tab} />
      <input type="hidden" name="ruleRef" value={tab === "cast_drink" ? `drink:${drinkId}` : ""} />
      <input type="hidden" name="castId" value={needsCast ? castId : ""} />
      <input type="hidden" name="qty" value={qty} />
      <input type="hidden" name="label" value={tab === "bottle" ? bottleLabel : ""} />
      <input type="hidden" name="amount" value={tab === "bottle" ? bottleAmount : 0} />

      <div className="grid grid-cols-4 gap-2">
        {tabs.map((t) => (
          <button
            type="button"
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setQty(1);
            }}
            className={`min-h-14 rounded-xl text-xs font-bold ${
              tab === t.key ? "bg-(--color-txt) text-white" : "border border-(--color-line) bg-(--color-bg)"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-(--color-line) bg-white p-3.5">
        {tab === "cast_drink" && (
          <>
            <p className="mb-2 text-[11px] text-(--color-dim)">1. 種類</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {drinks.map((d) => (
                <button
                  type="button"
                  key={d.id}
                  onClick={() => setDrinkId(d.id)}
                  className={`min-h-11 rounded-lg px-4 text-[13px] ${
                    drinkId === d.id ? "bg-(--color-txt) font-medium text-white" : "border border-(--color-line)"
                  }`}
                >
                  {d.label} ¥{d.price.toLocaleString()}
                </button>
              ))}
            </div>
          </>
        )}

        {tab === "bottle" && (
          <>
            <p className="mb-2 text-[11px] text-(--color-dim)">1. 銘柄と金額（税抜）</p>
            <div className="mb-3 flex flex-wrap gap-2">
              <input
                value={bottleLabel}
                onChange={(e) => setBottleLabel(e.target.value)}
                placeholder="モエ・エ・シャンドン"
                className="min-h-11 grow rounded-lg border border-(--color-line) px-3 text-sm"
              />
              <input
                type="number"
                inputMode="numeric"
                value={bottleAmount || ""}
                onChange={(e) => setBottleAmount(Number(e.target.value))}
                placeholder="28000"
                className="min-h-11 w-32 rounded-lg border border-(--color-line) px-3 text-sm"
              />
            </div>
          </>
        )}

        {tab === "nomination" && (
          <>
            <p className="mb-2 text-[11px] text-(--color-dim)">1. 種類</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {(
                [
                  ["nomination", "本指名"],
                  ["inhouse_nomination", "場内指名"],
                  ["douhan", "同伴"],
                ] as const
              ).map(([k, label]) => (
                <button
                  type="button"
                  key={k}
                  onClick={() => setNomKind(k)}
                  className={`min-h-11 rounded-lg px-4 text-[13px] ${
                    nomKind === k ? "bg-(--color-txt) font-medium text-white" : "border border-(--color-line)"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}

        {needsCast && (
          <>
            <div className="mb-2 flex items-baseline gap-2">
              <p className="text-[11px] text-(--color-dim)">2. 誰の分ですか？</p>
              <p className="text-[10px] font-medium text-(--color-accent)">※ ここを飛ばすと締められません</p>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {casts.map((c, i) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setCastId(c.id)}
                  className={`flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-xl ${
                    castId === c.id
                      ? "border-2 border-(--color-accent) bg-(--color-accent-soft)"
                      : "border border-(--color-line) bg-white"
                  }`}
                >
                  <Avatar name={c.displayName} tone={i} />
                  <span className={`text-[11px] ${castId === c.id ? "font-bold" : ""}`}>{c.displayName}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center gap-3 rounded-lg border border-(--color-line) bg-white px-3 py-2.5">
          <span className="text-[11px] text-(--color-dim)">{tab === "extend" ? "延長回数" : "数量"}</span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="h-11 w-11 rounded-lg border border-(--color-line) text-lg"
            >
              −
            </button>
            <span className="min-w-6 text-center text-lg font-bold">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => q + 1)}
              className="h-11 w-11 rounded-lg border border-(--color-line) text-lg"
            >
              ＋
            </button>
          </div>
          <div className="grow" />
          <div className="text-right">
            <div className="text-[10px] text-(--color-dim)">お会計 ¥{preview.amount.toLocaleString()}</div>
            <div className="text-[15px] font-bold text-(--color-gold)">
              バック ¥{preview.back.toLocaleString()}
              <span className="ml-1 text-[10px] font-normal text-(--color-dim)">{preview.note}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button type="reset" className={btnGhostCls} onClick={() => setCastId("")}>
            クリア
          </button>
          <button
            disabled={!canSubmit}
            className="min-h-12 grow rounded-lg bg-(--color-accent) text-sm font-bold text-white disabled:opacity-40"
          >
            伝票に追加する
          </button>
        </div>
      </div>
    </form>
  );
}
