"use client";

import { useState, useTransition } from "react";
import { setDispatchBillingYm } from "../actions";

/**
 * 派遣行の「請求月」上書きセル（migration 0089）。
 * 研修者など請求が月をまたぐ場合に、この派遣を入れる請求月を指定する。
 * 空欄 = 取引先の締め期間どおり（通常はこのまま）。
 */
export function BillingYmCell({ id, value }: { id: string; value: string | null }) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const [pending, start] = useTransition();

  const onSave = (raw: string) => {
    const next = raw.trim() === "" ? null : raw;
    if (next === (value ?? null)) return;
    start(async () => {
      const r = await setDispatchBillingYm(id, next);
      setError(!!r.error);
      setSaved(!r.error);
      if (!r.error) setTimeout(() => setSaved(false), 1500);
    });
  };

  return (
    <input
      type="month"
      defaultValue={value ?? ""}
      onBlur={(e) => onSave(e.target.value)}
      title="請求月の上書き（空欄=締め期間どおり）。研修などで請求を翌月に回す時に使います"
      className={`w-32 rounded border bg-white px-1 py-0.5 text-xs outline-none ${
        error ? "border-red-400" : saved ? "border-emerald-400" : value ? "border-amber-400" : "border-(--color-line)"
      } ${pending ? "opacity-50" : ""}`}
    />
  );
}
