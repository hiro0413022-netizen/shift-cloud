"use client";

import { useActionState } from "react";
import Link from "next/link";
import { addItem, addCode } from "../actions";
import { inputCls, btnCls, Field } from "@/components/ui";

type Code = { kind: string; name: string; abbr: string };

export function NewItemForm({
  categories,
  makers,
  locations,
}: {
  categories: Code[];
  makers: Code[];
  locations: string[];
}) {
  const [state, action, pending] = useActionState(addItem, {} as { error?: string; code?: string });

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="品目 *">
          <select name="category" required className={inputCls} defaultValue="">
            <option value="" disabled>
              選択してください
            </option>
            {categories.map((c) => (
              <option key={c.abbr} value={c.name}>
                {c.name}（{c.abbr}）
              </option>
            ))}
          </select>
        </Field>
        <Field label="メーカー *">
          <select name="maker" required className={inputCls} defaultValue="">
            <option value="" disabled>
              選択してください
            </option>
            {makers.map((m) => (
              <option key={m.abbr} value={m.name}>
                {m.name}（{m.abbr}）
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="商品名 *">
        <input name="name" required className={inputCls} placeholder="例: Sticky Evolution 2.3 ブルー (有)" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="仕様">
          <input name="spec" className={inputCls} />
        </Field>
        <Field label="カラー・仕様">
          <input name="variant" className={inputCls} placeholder="例: ホワイト" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="単位">
          <select name="unit" className={inputCls} defaultValue="個">
            {["個", "本", "枚", "ダース", "箱"].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </Field>
        <Field label="定価（税抜）">
          <input name="listPrice" type="number" min={0} className={inputCls} />
        </Field>
        <Field label="仕入単価">
          <input name="costPrice" type="number" min={0} className={inputCls} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="保管場所１">
          <input name="location1" list="locs" className={inputCls} placeholder="例: グリップホルダーに陳列" />
          <datalist id="locs">
            {locations.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>
        <Field label="保管場所２">
          <input name="location2" className={inputCls} placeholder="例: 棚下収納にもあり" />
        </Field>
      </div>

      <Field label="適正在庫（これを割ると発注候補に載ります）">
        <input name="reorderPoint" type="number" min={0} className={inputCls} placeholder="未設定でも構いません" />
      </Field>

      {state.error && <p className="text-sm text-(--color-danger)">{state.error}</p>}
      {state.code && (
        <p className="text-sm text-(--color-ok)">
          登録しました。管理番号は <span className="font-bold">{state.code}</span> です
          <Link href="/items" className="underline underline-offset-2">
            一覧へ
          </Link>
        </p>
      )}

      <button disabled={pending} className={btnCls}>
        {pending ? "登録中..." : "登録する"}
      </button>
    </form>
  );
}

export function NewCodeForm() {
  const [state, action, pending] = useActionState(addCode, {} as { error?: string; ok?: string });
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <Field label="種別">
        <select name="kind" className={inputCls} defaultValue="maker">
          <option value="maker">メーカー</option>
          <option value="category">品目</option>
        </select>
      </Field>
      <Field label="名称">
        <input name="name" className={inputCls} placeholder="例: ダンロップ" />
      </Field>
      <Field label="略号（英大文字2〜3字）">
        <input name="abbr" className={`${inputCls} uppercase`} maxLength={3} placeholder="DL" />
      </Field>
      <button disabled={pending} className={btnCls}>
        {pending ? "追加中..." : "コード表に追加"}
      </button>
      {state.error && <p className="w-full text-sm text-(--color-danger)">{state.error}</p>}
      {state.ok && <p className="w-full text-sm text-(--color-ok)">{state.ok}</p>}
    </form>
  );
}
