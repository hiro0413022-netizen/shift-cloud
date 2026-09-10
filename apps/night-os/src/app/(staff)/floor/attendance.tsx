"use client";

import { useState } from "react";
import { toggleAttendance } from "./actions";
import { Avatar, btnGhostCls } from "@/components/ui";

type Row = { id: string; displayName: string; hourlyWage: number; minutes: number; onDuty: boolean };

/** 出勤打刻。名前を押すだけ（押し間違いは同じボタンで戻せる） */
export function AttendancePanel({ rows }: { rows: Row[] }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={btnGhostCls}>
        キャスト出勤
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30 sm:items-center sm:justify-center">
      <div className="max-h-[92vh] w-full overflow-auto rounded-t-2xl bg-white p-5 sm:max-w-lg sm:rounded-2xl">
        <div className="mb-3 flex items-center">
          <h2 className="text-base font-bold">出勤</h2>
          <div className="grow" />
          <button onClick={() => setOpen(false)} className="text-sm text-(--color-dim)">
            閉じる
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {rows.map((r, i) => (
            <form action={toggleAttendance} key={r.id} className="flex items-center gap-3 rounded-lg border border-(--color-line) p-2">
              <input type="hidden" name="castId" value={r.id} />
              <input type="hidden" name="baseWage" value={r.hourlyWage} />
              <Avatar name={r.displayName} tone={i} />
              <div className="grow">
                <div className="text-sm font-medium">{r.displayName}</div>
                <div className="text-[11px] text-(--color-dim)">
                  時給 ¥{r.hourlyWage.toLocaleString("ja-JP")}
                  {r.minutes > 0 && ` ・ ${(r.minutes / 60).toFixed(1)}h`}
                </div>
              </div>
              <button
                className={`min-h-11 rounded-lg px-4 text-sm font-bold ${
                  r.onDuty ? "bg-(--color-ok-soft) text-(--color-ok)" : "border border-(--color-line)"
                }`}
              >
                {r.onDuty ? "出勤中" : "出勤する"}
              </button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
