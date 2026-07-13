"use client";

import { useRef, useState, useTransition } from "react";
import { uploadDoc, downloadUrl, removeDoc } from "./actions";

export type LibItem = {
  path: string;
  name: string;
  category: string;
  size: number;
  createdAt: string;
};

function fmtSize(n: number) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

export function LibraryClient({ items, categories }: { items: LibItem[]; categories: string[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const grouped = new Map<string, LibItem[]>();
  for (const it of items) {
    if (!grouped.has(it.category)) grouped.set(it.category, []);
    grouped.get(it.category)!.push(it);
  }

  const download = (path: string) =>
    startTransition(async () => {
      const r = await downloadUrl(path);
      if (r.url) window.location.href = r.url;
      else setMsg(r.error ?? "ダウンロードに失敗しました");
    });

  const remove = (path: string, name: string) => {
    if (!window.confirm(`「${name}」を削除しますか？`)) return;
    startTransition(async () => {
      const r = await removeDoc(path);
      setMsg(r.error ?? "削除しました");
    });
  };

  return (
    <div className="space-y-6">
      {/* アップロード */}
      <form
        ref={formRef}
        action={(fd) =>
          startTransition(async () => {
            const r = await uploadDoc(fd);
            setMsg(r.error ?? "アップロードしました");
            if (!r.error) formRef.current?.reset();
          })
        }
        className="rounded-xl border border-[--color-line] bg-[--color-panel] p-4"
      >
        <p className="mb-3 text-sm font-medium">資料をアップロード（25MBまで）</p>
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="file"
            name="file"
            required
            className="min-w-0 flex-1 text-sm file:mr-3 file:rounded-lg file:border file:border-[--color-line] file:bg-[--color-panel-2] file:px-3 file:py-1.5 file:text-sm file:text-[--color-txt]"
          />
          <input
            name="category"
            list="lib-categories"
            placeholder="分類（例: 出店計画）"
            className="rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-1.5 text-sm"
          />
          <datalist id="lib-categories">
            {categories.map((c) => <option key={c} value={c} />)}
            <option value="出店計画" />
            <option value="事業計画" />
            <option value="会議資料" />
            <option value="月次資料" />
          </datalist>
          <button disabled={pending} className="rounded-lg bg-sky-500/20 px-4 py-1.5 text-sm text-sky-300 disabled:opacity-40">
            {pending ? "処理中…" : "アップロード"}
          </button>
        </div>
        {msg && <p className="mt-2 text-xs text-[--color-dim]">{msg}</p>}
      </form>

      {/* 一覧 */}
      {items.length === 0 && (
        <p className="text-sm text-[--color-dim]">まだ資料がありません。上のフォームからアップロードしてください</p>
      )}
      {[...grouped.entries()].map(([cat, list]) => (
        <div key={cat}>
          <h2 className="mb-2 text-sm font-semibold text-[--color-gold]">📁 {cat}</h2>
          <div className="overflow-hidden rounded-xl border border-[--color-line]">
            {list.map((it, i) => (
              <div
                key={it.path}
                className={`flex items-center gap-3 bg-[--color-panel] px-4 py-3 ${i > 0 ? "border-t border-[--color-line]" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{it.name}</p>
                  <p className="text-[11px] text-[--color-dim]">
                    {fmtSize(it.size)}{it.createdAt ? ` ・ ${it.createdAt.slice(0, 10)}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => download(it.path)}
                  disabled={pending}
                  className="rounded-lg border border-[--color-line] px-3 py-1.5 text-sm text-sky-300 disabled:opacity-40"
                >
                  ⬇ DL
                </button>
                <button
                  onClick={() => remove(it.path, it.name)}
                  disabled={pending}
                  className="rounded-lg border border-[--color-line] px-2.5 py-1.5 text-sm text-[--color-dim] disabled:opacity-40"
                  title="削除"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
