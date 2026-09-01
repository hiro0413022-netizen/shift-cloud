"use client";

import { useState } from "react";
import { EXPENSE_CATEGORIES, PAY_METHODS, expenseEffect, expenseInputError } from "@/lib/expense";
import { addExpense } from "./actions";
import { inputCls, btnCls } from "@/components/ui";

/**
 * 経費の入力フォーム（#191・スタッフが使う）
 *
 * ユーザー確定（2026-09-01）:
 *  - 支払い方法は「店の現金／立替／掛け」の3つ
 *  - 科目は**よく使うものをボタンで選ぶ**（迷ったら「わからない」でよい＝本部が直す）
 *  - 写真は撮らない運用なので、**納品書・伝票番号**を紙との突き合わせに使う
 *
 * 選んだ支払い方法で「帳簿がどうなるか」をその場に出す。
 * 経理を知らない人が押すボタンなので、押す前に結果が見えていないと間違いに気づけない。
 */
export function ExpenseEntry({
  today,
  defaultPaidBy,
  recentPayees,
}: {
  today: string;
  defaultPaidBy: string;
  recentPayees: string[];
}) {
  const [method, setMethod] = useState<string>("cash");
  const [category, setCategory] = useState<string>("仕入");
  const [spentOn, setSpentOn] = useState(today);
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(defaultPaidBy);

  const effect = expenseEffect(method);
  const error = expenseInputError({ spentOn, amount: Number(amount || 0), item, method, paidBy });

  const chip = (on: boolean) =>
    `rounded-xl border px-3 py-2 text-sm transition-colors ${
      on ? "border-(--color-gold) bg-(--color-gold)/15 font-semibold" : "border-(--color-line) hover:border-(--color-gold)"
    }`;

  return (
    <form action={addExpense} className="space-y-4">
      <input type="hidden" name="method" value={method} />
      <input type="hidden" name="category" value={category === "__unknown__" ? "" : category} />

      <div>
        <p className="mb-1.5 text-xs text-(--color-dim)">1. どうやって払いましたか</p>
        <div className="flex flex-wrap gap-2">
          {PAY_METHODS.map((m) => (
            <button key={m.value} type="button" onClick={() => setMethod(m.value)} className={chip(method === m.value)}>
              {m.label}
              <span className="ml-1.5 text-xs text-(--color-dim)">{m.hint}</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-(--color-dim)">{effect.note}</p>
      </div>

      <div>
        <p className="mb-1.5 text-xs text-(--color-dim)">2. 何を買いましたか</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="text-xs text-(--color-dim)">
            日付
            <input type="date" name="spent_on" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} className={inputCls} />
          </label>
          <label className="text-xs text-(--color-dim) sm:col-span-2">
            品名（何を買ったか）
            <input name="item" value={item} onChange={(e) => setItem(e.target.value)} placeholder="レンジボール 100個" className={inputCls} />
          </label>
          <label className="text-xs text-(--color-dim)">
            金額（税込）
            <input
              name="amount"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="12000"
              className={`${inputCls} text-right tabular-nums`}
            />
          </label>
          <label className="text-xs text-(--color-dim) sm:col-span-2">
            支払先（お店・業者）
            <input name="payee" list="recent-payees" placeholder="○○スポーツ" className={inputCls} />
            <datalist id="recent-payees">
              {recentPayees.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="text-xs text-(--color-dim)">
            納品書・伝票番号
            <input name="doc_no" placeholder="No.12345" className={inputCls} />
          </label>
          {method === "advance" && (
            <label className="text-xs text-(--color-dim)">
              立替えた人
              <input name="paid_by" value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className={inputCls} />
            </label>
          )}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs text-(--color-dim)">3. どの科目ですか（迷ったら「わからない」でOK）</p>
        <div className="flex flex-wrap gap-2">
          {EXPENSE_CATEGORIES.map((c) => (
            <button key={c.value} type="button" onClick={() => setCategory(c.value)} className={chip(category === c.value)}>
              {c.value}
              <span className="ml-1.5 text-xs text-(--color-dim)">{c.hint}</span>
            </button>
          ))}
          <button type="button" onClick={() => setCategory("__unknown__")} className={chip(category === "__unknown__")}>
            わからない
            <span className="ml-1.5 text-xs text-(--color-dim)">本部が入れます</span>
          </button>
        </div>
      </div>

      <label className="block text-xs text-(--color-dim)">
        メモ（任意）
        <input name="memo" placeholder="○月分・△△の補充 など" className={inputCls} />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={!!error} className={btnCls}>
          この内容で登録する
        </button>
        {error && <span className="text-xs text-(--color-dim)">{error}</span>}
      </div>
    </form>
  );
}
