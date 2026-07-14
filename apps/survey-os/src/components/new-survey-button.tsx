"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSurvey } from "@/app/(main)/[surveyId]/edit/actions";
import { inputCls, btnCls, btnGhostCls } from "@/components/ui";

export function NewSurveyButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function create() {
    setErr(null);
    start(async () => {
      const res = await createSurvey(title);
      if (res.error || !res.id) setErr(res.error ?? "作成に失敗しました。");
      else router.push(`/${res.id}/edit`);
    });
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className={btnCls}>＋ 新規アンケート</button>;
  }

  return (
    <div className="flex items-center gap-2">
      <input className={`${inputCls} w-56`} value={title} placeholder="アンケート名" onChange={(e) => setTitle(e.target.value)} />
      <button type="button" onClick={create} disabled={pending} className={btnCls}>{pending ? "作成中..." : "作成して編集"}</button>
      <button type="button" onClick={() => setOpen(false)} className={btnGhostCls}>キャンセル</button>
      {err && <span className="text-sm text-rose-600">{err}</span>}
    </div>
  );
}
