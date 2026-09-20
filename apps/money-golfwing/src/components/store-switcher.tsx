"use client";

import { useTransition } from "react";
import { setStore } from "@/app/(main)/store-actions";
import type { AccessibleStore } from "@/lib/auth";

/**
 * 店舗切替。
 *
 * 2026-09-20 ユーザー指摘「宝塚→FRANK に変えると勝手に宝塚に戻る」「小川さんは FRANK にしか入れない」:
 * 以前は <form action={setStore}> ＋ defaultValue だったため、React 19 が保存のあとにフォームを
 * 自動リセットし、プルダウンの表示が最初に開いたときの店舗へ戻っていた（cookie と中身は切り替わっていた）。
 * → フォームを使わず直接呼ぶ。さらに key に今の店舗を入れ、切り替わったら必ず新しい店舗の表示で作り直す。
 */
export function StoreSwitcher({ stores, currentId }: { stores: AccessibleStore[]; currentId: string | null }) {
  const [pending, start] = useTransition();
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
    <select
      key={currentId ?? ""}
      name="store_id"
      defaultValue={currentId ?? ""}
      disabled={pending}
      onChange={(e) => {
        const fd = new FormData();
        fd.set("store_id", e.currentTarget.value);
        start(async () => {
          await setStore(fd);
        });
      }}
      className="rounded-lg border border-(--color-line) bg-(--color-bg) px-2 py-1 text-sm outline-none focus:border-(--color-gold) disabled:opacity-60"
    >
      {stores.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
