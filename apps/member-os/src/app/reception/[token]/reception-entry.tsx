"use client";

import { useState } from "react";
import { ReceptionForm } from "./reception-form";
import { ReturningForm } from "./returning-form";

/**
 * 店頭タブレットの最初の1枚（DECISIONS #226）。
 * 「初めて」か「2回目以降」かだけ選んでいただき、あとは道を分ける。
 *
 * ここを挟む理由: 常連の方に毎回すべて書かせない（ユーザー指示 2026-09-06）。
 * 予約からのご来店（/reception/v/[intakeToken]）は入口が確定しているのでこの画面を通らない。
 */
export function ReceptionEntry({ token, storeName }: { token: string; storeName: string | null }) {
  const [mode, setMode] = useState<"choose" | "new" | "returning">("choose");

  if (mode === "new")
    return <ReceptionForm token={token} storeName={storeName} onBack={() => setMode("choose")} />;

  if (mode === "returning")
    return (
      <ReturningForm
        token={token}
        storeName={storeName}
        onBack={() => setMode("choose")}
        onNotFound={() => setMode("new")}
      />
    );

  return (
    <div className="space-y-4">
      {storeName && (
        <div className="rounded-xl border border-(--color-line) bg-white p-3 text-center text-sm font-medium text-(--color-dim) shadow-sm">
          {storeName}
        </div>
      )}

      <button
        type="button"
        onClick={() => setMode("returning")}
        className="w-full rounded-2xl border-2 border-accent bg-accent/5 px-6 py-8 text-center transition-colors hover:bg-accent/10"
      >
        <span className="block text-xl font-bold text-(--color-txt)">2回目以降の方</span>
        <span className="mt-1 block text-sm text-(--color-dim)">お名前で探します。ご記入はほとんど要りません</span>
      </button>

      <button
        type="button"
        onClick={() => setMode("new")}
        className="w-full rounded-2xl border border-(--color-line) bg-white px-6 py-8 text-center transition-colors hover:bg-(--color-panel-2)"
      >
        <span className="block text-xl font-bold text-(--color-txt)">初めてのご来店の方</span>
        <span className="mt-1 block text-sm text-(--color-dim)">お客様情報をご記入いただきます</span>
      </button>
    </div>
  );
}
