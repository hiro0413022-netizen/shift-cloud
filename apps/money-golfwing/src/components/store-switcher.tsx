"use client";

import { setStore } from "@/app/(main)/store-actions";
import type { AccessibleStore } from "@/lib/auth";

export function StoreSwitcher({ stores, currentId }: { stores: AccessibleStore[]; currentId: string | null }) {
  if (stores.length === 0) return null;
  // 店舗が1つだけの人（現場アカウント）は切り替え不可＝名前だけ表示（店舗またぎ事故防止）
  if (stores.length === 1) {
    return (
      <span className="rounded-lg border border-(--color-line) bg-(--color-bg) px-2 py-1 text-sm text-(--color-dim)">
        {stores[0].name}
      </span>
    );
  }
  return (
    <form action={setStore}>
      <select
        name="store_id"
        defaultValue={currentId ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-(--color-line) bg-(--color-bg) px-2 py-1 text-sm outline-none focus:border-(--color-gold)"
      >
        {stores.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </form>
  );
}
