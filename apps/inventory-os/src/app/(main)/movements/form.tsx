"use client";

import { useActionState } from "react";
import { recordMovement } from "./actions";
import { inputCls, btnCls, Field } from "@/components/ui";

const KINDS = [
  { v: "receipt", l: "入荷（＋）" },
  { v: "sale", l: "販売（−）" },
  { v: "workshop", l: "工房使用（−）" },
  { v: "damage", l: "破損・廃棄（−）" },
  { v: "transfer", l: "店舗間移動（＋）" },
];

export function MovementForm() {
  const [state, action, pending] = useActionState(recordMovement, {} as { error?: string; ok?: string });
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="管理番号 *">
          <input name="code" required className={`${inputCls} uppercase`} placeholder="GR-IO-001" />
        </Field>
        <Field label="種別">
          <select name="kind" className={inputCls} defaultValue="sale">
            {KINDS.map((k) => (
              <option key={k.v} value={k.v}>
                {k.l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="数量">
          {/* 符号は種別で決まるので、ここは常に正の数を入れてもらう */}
          <input name="qty" type="number" min={1} defaultValue={1} className={inputCls} />
        </Field>
        <Field label="発生日">
          <input name="occurredOn" type="date" className={inputCls} />
        </Field>
      </div>
      <Field label="メモ">
        <input name="memo" className={inputCls} placeholder="例: 田中様 グリップ交換" />
      </Field>
      {state.error && <p className="text-sm text-(--color-danger)">{state.error}</p>}
      {state.ok && <p className="text-sm text-(--color-ok)">{state.ok}</p>}
      <button disabled={pending} className={btnCls}>
        {pending ? "記録中..." : "記録する"}
      </button>
    </form>
  );
}
