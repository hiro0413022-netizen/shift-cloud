"use client";

import { deletePeriod } from "./actions";

export function DeletePeriodButton({ id, label, reqCount }: { id: string; label: string; reqCount: number }) {
  return (
    <form
      action={deletePeriod}
      onSubmit={(e) => {
        const warn = reqCount > 0
          ? `「${label}」を削除します。\nこの募集に提出された希望 ${reqCount} 件も一緒に削除されます。よろしいですか？`
          : `「${label}」を削除します。よろしいですか？`;
        if (!confirm(warn)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="rounded border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50">
        🗑 削除
      </button>
    </form>
  );
}
