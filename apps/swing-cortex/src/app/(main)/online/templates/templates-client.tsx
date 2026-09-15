"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Template } from "@/lib/online/data";
import { SectionTitle, Toast, useToast, copyText } from "../ui";
import { saveTemplate, deleteTemplate, reorderTemplates } from "../online-actions";

export default function TemplatesClient({ templates }: { templates: Template[] }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(templates);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, start] = useTransition();
  useEffect(() => setItems(templates), [templates]);

  const open = (t: Template | null) => {
    setEditing(t ? t.id : "new");
    setTitle(t?.title ?? "");
    setBody(t?.body ?? "");
  };

  const save = () =>
    start(async () => {
      const r = await saveTemplate({ id: editing === "new" ? null : editing, title, body });
      if (!r.ok) return toast.show(r.error);
      setEditing(null);
      toast.show("保存しました");
      router.refresh();
    });

  const remove = (id: string) =>
    start(async () => {
      if (!confirm("この定型文を削除しますか？")) return;
      const r = await deleteTemplate(id);
      if (!r.ok) return toast.show(r.error);
      setEditing(null);
      router.refresh();
    });

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next);
    start(async () => {
      const r = await reorderTemplates(next.map((t) => t.id));
      if (!r.ok) toast.show(r.error);
    });
  };

  const editor = (
    <div className="rr-card rr-pop space-y-2.5 p-4">
      <input className="rr-input !py-2 font-semibold" placeholder="タイトル（例：ラウンドおつかれさまでした）" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="rr-input min-h-[160px] leading-relaxed" placeholder="本文" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex gap-2">
        {editing !== "new" && editing && <button className="rr-btn-ghost text-(--rr-wait)" onClick={() => remove(editing)}>削除</button>}
        <button className="rr-btn-ghost ml-auto" onClick={() => setEditing(null)}>やめる</button>
        <button className="rr-btn-ink" disabled={busy} onClick={save}>保存</button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        en="Phrases"
        ja="定型文 — 返信欄の「💬 定型文」からすぐ入れられます"
        right={<button className="rr-btn-ink" onClick={() => open(null)}>＋ 追加</button>}
      />
      {editing === "new" && <div className="mb-3">{editor}</div>}
      <ul className="space-y-2.5">
        {items.map((t, i) =>
          editing === t.id ? (
            <li key={t.id}>{editor}</li>
          ) : (
            <li key={t.id} className="rr-card flex gap-3 p-4">
              <div className="flex flex-col gap-1">
                <button className="h-7 w-7 rounded-lg border border-(--color-line) text-xs text-(--color-dim) disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="上へ">▲</button>
                <button className="h-7 w-7 rounded-lg border border-(--color-line) text-xs text-(--color-dim) disabled:opacity-30" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="下へ">▼</button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{t.title}</div>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-(--color-dim)">{t.body}</p>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                <button className="rr-btn-ghost !px-3 !py-1.5 text-xs" onClick={() => open(t)}>編集</button>
                <button
                  className="rr-btn-ghost !px-3 !py-1.5 text-xs"
                  onClick={async () => toast.show((await copyText(t.body)) ? "コピーしました" : "コピーできませんでした")}
                >
                  コピー
                </button>
              </div>
            </li>
          )
        )}
      </ul>
      <Toast msg={toast.msg} />
    </div>
  );
}
