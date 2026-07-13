"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addStudent } from "./actions";

/** 生徒追加（名前だけでOK。詳細はカルテで後から） */
export function AddStudentForm() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-[--color-line] bg-[--color-panel] py-3 text-sm text-[--color-dim] hover:text-[--color-txt]"
      >
        ＋ 生徒を追加（名前だけでOK）
      </button>
    );
  }
  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          const r = await addStudent(fd);
          if (r.error) setMsg(r.error);
          else if (r.id) router.push(`/students/${r.id}`);
        })
      }
      className="rounded-xl border border-[--color-line] bg-[--color-panel] p-4"
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <input name="name" required placeholder="名前 *" className="input-dark" />
        <input name="name_kana" placeholder="かな" className="input-dark" />
        <input name="member_code" placeholder="会員番号（Smart Hallo）" className="input-dark" />
        <input name="goal" placeholder="目標（例: 90台で回る）" className="input-dark" />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button disabled={pending} className="btn-gold">
          {pending ? "登録中…" : "登録してカルテを開く"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-[--color-dim]">キャンセル</button>
        {msg && <span className="text-xs text-red-400">{msg}</span>}
      </div>
    </form>
  );
}
