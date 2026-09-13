"use client";

import { useTransition } from "react";
import { setEntryStatus } from "../actions";

const LABEL: Record<string, string> = {
  confirmed: "参加確定",
  applied: "Web申込",
  waitlist: "キャンセル待ち",
  cancelled: "取消",
};

const TONE: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700",
  applied: "bg-sky-50 text-sky-700",
  waitlist: "bg-amber-50 text-amber-700",
  cancelled: "bg-(--color-panel-2) text-(--color-dim) line-through",
};

/**
 * 申込状況の変更。
 * ★ Web申込を「確定」に上げるのは人の操作にする — 会場の枠取りや同伴の調整があるので、
 *   申し込まれた瞬間に確定にはしない。
 */
export function EntryStatusCell({
  compId,
  participantId,
  status,
  source,
  agreedAt,
}: {
  compId: string;
  participantId: string;
  status: "confirmed" | "applied" | "waitlist" | "cancelled";
  source: "staff" | "web";
  agreedAt?: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-center gap-1">
      <select
        disabled={pending}
        defaultValue={status}
        onChange={(e) =>
          startTransition(() => {
            void setEntryStatus(compId, participantId, e.target.value as typeof status);
          })
        }
        className={`rounded-full px-2 py-1 text-xs font-semibold ${TONE[status]}`}
      >
        {Object.entries(LABEL).map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      {source === "web" && (
        <span className="text-[10px] text-(--color-dim)">
          ご本人申込{agreedAt ? "・同意済" : ""}
        </span>
      )}
    </div>
  );
}
