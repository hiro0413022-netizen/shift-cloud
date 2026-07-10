"use client";

import { useState, useTransition } from "react";
import { correctAttendance } from "./actions";
import { Button, Input, Label } from "@/components/ui";

export function CorrectionForm({ staffId, storeId, date, breakMinutes, isBreakManual }: { staffId: string; storeId: string; date: string; breakMinutes?: number; isBreakManual?: boolean }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [reset, setReset] = useState(false);
  const [pending, start] = useTransition();

  if (!open) {
    return <button onClick={() => setOpen(true)} className="text-sm text-brand hover:underline">修正</button>;
  }

  function submit(formData: FormData) {
    start(async () => {
      const res = await correctAttendance(formData);
      if (res.error) setMsg(res.error);
      else { setMsg("修正しました ✓"); setOpen(false); }
    });
  }

  return (
    <form action={submit} className="flex flex-wrap items-end gap-2 rounded-md bg-zinc-50 p-2">
      <input type="hidden" name="staff_id" value={staffId} />
      <input type="hidden" name="store_id" value={storeId} />
      <input type="hidden" name="date" value={date} />
      <div>
        <Label>出勤</Label>
        <Input name="clock_in" type="time" className="!w-28" />
      </div>
      <div>
        <Label>退勤</Label>
        <Input name="clock_out" type="time" className="!w-28" />
      </div>
      <div>
        <Label>休憩（分）</Label>
        <Input
          name="break_minutes"
          type="number"
          min={0}
          max={1440}
          disabled={reset}
          defaultValue={breakMinutes ?? ""}
          placeholder="自動"
          className="!w-24"
        />
        <label className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500">
          <input type="checkbox" name="break_reset" checked={reset} onChange={(e) => setReset(e.target.checked)} />
          自動計算に戻す
        </label>
        <p className="mt-0.5 text-[10px] text-zinc-400">{isBreakManual ? "現在: 手動設定" : "現在: 自動計算"}</p>
      </div>
      <div className="min-w-40 flex-1">
        <Label>修正理由 *</Label>
        <Input name="reason" required placeholder="例: 打刻漏れ／休憩の実態に合わせて修正" />
      </div>
      <Button type="submit" disabled={pending} className="!py-1.5">{pending ? "…" : "保存"}</Button>
      <button type="button" onClick={() => setOpen(false)} className="pb-2 text-xs text-zinc-400">閉じる</button>
      {msg && <p className="w-full text-xs text-red-600">{msg}</p>}
    </form>
  );
}
