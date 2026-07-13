"use client";

import { useActionState } from "react";
import { createDocumentAction } from "../actions";
import { DOC_TYPE_LABELS } from "@/lib/legal-constants";
import { Field, inputCls, btnCls } from "@/components/ui";

type Segment = { id: string; name: string };

export function NewForm({ segments }: { segments: Segment[] }) {
  const [state, action, pending] = useActionState(createDocumentAction, {});

  return (
    <form action={action} className="space-y-4">
      <Field label="件名 *">
        <input name="title" required className={inputCls} placeholder="例: テナント賃貸借契約（宝塚店）" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="種別">
          <select name="doc_type" defaultValue="contract" className={inputCls}>
            {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="相手方">
          <input name="counterparty" className={inputCls} placeholder="例: ○○不動産株式会社" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="事業（未選択=全社）">
          <select name="segment_id" defaultValue="" className={inputCls}>
            <option value="">全社</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="契約金額（任意）">
          <input name="amount" type="number" step="1" className={inputCls} placeholder="円" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="契約開始日">
          <input name="effective_date" type="date" className={inputCls} />
        </Field>
        <Field label="契約満了日">
          <input name="expiry_date" type="date" className={inputCls} />
        </Field>
      </div>

      <div className="grid items-end gap-4 sm:grid-cols-2">
        <Field label="解約通知の必要日数（例: 90）">
          <input name="renewal_notice_days" type="number" step="1" className={inputCls} placeholder="日数" />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input name="auto_renew" type="checkbox" className="h-4 w-4 rounded border-(--color-line) bg-(--color-panel-2)" />
          自動更新あり
        </label>
      </div>

      <Field label="要点・メモ">
        <textarea name="summary" rows={3} className={inputCls} placeholder="契約の要点、注意事項など" />
      </Field>

      <Field label="ファイル（PDF / 画像）">
        <input name="file" type="file" accept=".pdf,image/*" className="block w-full text-sm text-(--color-dim) file:mr-3 file:rounded-lg file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-white" />
      </Field>

      {state.error && <p className="text-sm text-red-400">{state.error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button disabled={pending} className={btnCls}>
          {pending ? "登録中..." : "登録する"}
        </button>
      </div>
      <p className="text-xs text-(--color-dim)">
        登録後は「下書き」で保存されます。締結・有効化の承認はGENESIS側で古川さんが行います。
      </p>
    </form>
  );
}
