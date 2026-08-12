"use client";

import { useActionState } from "react";
import type { ImportState } from "./actions";
import { Panel, inputCls, btnCls } from "@/components/ui";

/** 取込フォーム1枚（page.tsx をサーバー側で店舗判定できるようにクライアント部分を切り出した・#134） */
export function UploadCard({
  title, desc, action, accept,
}: {
  title: string;
  desc: string;
  action: (prev: ImportState, fd: FormData) => Promise<ImportState>;
  accept: string;
}) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(action, {});
  return (
    <Panel title={title} className="d1">
      <p className="mb-3 text-sm text-(--color-dim)">{desc}</p>
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="file" name="file" accept={accept} className={inputCls} required />
        <button disabled={pending} className={btnCls}>{pending ? "取込中..." : "取込む"}</button>
      </form>
      {state.error && <p className="mt-2 text-sm text-red-400">{state.error}</p>}
      {state.ok && <p className="mt-2 text-sm text-emerald-300">✓ {state.message}</p>}
    </Panel>
  );
}
