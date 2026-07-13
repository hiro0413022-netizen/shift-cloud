"use client";

import { useRef, useState, useTransition } from "react";
import { CLUBS } from "@/lib/lesson";
import { createModelUploadUrl, registerModel, modelPlayUrl, removeModel } from "./actions";

export type ModelItem = {
  id: string;
  club: string | null;
  distanceYd: number | null;
  note: string | null;
  coach: string;
  at: string;
};

export function ModelsClient({ items }: { items: ModelItem[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playUrls, setPlayUrls] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const clubRef = useRef<HTMLSelectElement>(null);
  const distRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setMsg("動画を選択してください"); return; }
    setBusy(true);
    try {
      const r = await createModelUploadUrl(file.name, file.size);
      if (!r.url || !r.path) { setMsg(r.error ?? "URL発行に失敗しました"); return; }
      const res = await fetch(r.url, { method: "PUT", headers: { "Content-Type": file.type || "video/mp4" }, body: file });
      if (!res.ok) { setMsg(`アップロード失敗（${res.status}）`); return; }
      const reg = await registerModel({
        path: r.path,
        club: clubRef.current?.value || undefined,
        distanceYd: distRef.current?.value ? Number(distRef.current.value) : undefined,
        note: noteRef.current?.value || undefined,
      });
      setMsg(reg.error ?? "お手本を登録しました");
      if (!reg.error && fileRef.current) fileRef.current.value = "";
    } finally {
      setBusy(false);
    }
  };

  const play = (id: string) =>
    startTransition(async () => {
      if (playUrls[id]) { setOpen(open === id ? null : id); return; }
      const r = await modelPlayUrl(id);
      if (r.url) { setPlayUrls((p) => ({ ...p, [id]: r.url! })); setOpen(id); }
      else setMsg(r.error ?? "再生できません");
    });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
        <p className="mb-3 text-sm font-medium text-(--color-gold)">お手本を登録</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <input ref={fileRef} type="file" accept="video/*" className="col-span-2 text-sm file:mr-3 file:rounded-lg file:border file:border-(--color-line) file:bg-(--color-panel-2) file:px-3 file:py-1.5 file:text-sm file:text-(--color-txt) md:col-span-1" />
          <select ref={clubRef} className="input-dark" defaultValue="">
            <option value="">クラブ</option>
            {CLUBS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input ref={distRef} type="number" placeholder="飛距離(yd)" className="input-dark" />
          <input ref={noteRef} placeholder="メモ（例: ハーフスイング）" className="input-dark" />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={upload} disabled={busy} className="btn-gold">{busy ? "登録中…" : "⬆ 登録"}</button>
          {msg && <span className="text-xs text-(--color-dim)">{msg}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {items.length === 0 && <p className="text-sm text-(--color-dim)">まだお手本がありません</p>}
        {items.map((m) => (
          <div key={m.id} className="rounded-xl border border-(--color-line) bg-(--color-panel) p-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-sm">{m.coach}</span>
              {m.club && <span className="rounded bg-(--color-header)/40 px-1.5 py-0.5">{m.club}</span>}
              {m.distanceYd != null && <span className="text-(--color-dim)">{m.distanceYd}yd</span>}
              <span className="ml-auto text-(--color-dim)">{m.at}</span>
            </div>
            {m.note && <p className="mt-1 text-xs text-(--color-dim)">{m.note}</p>}
            {open === m.id && playUrls[m.id] ? (
              <video src={playUrls[m.id]} controls playsInline className="mt-2 max-h-72 w-full rounded bg-black" />
            ) : (
              <button onClick={() => play(m.id)} disabled={pending} className="mt-2 w-full rounded-lg border border-(--color-line) bg-black/40 py-5 text-xs text-(--color-dim) hover:text-(--color-txt)">▶ 再生</button>
            )}
            <button
              onClick={() => { if (window.confirm("このお手本を削除しますか？")) startTransition(async () => { await removeModel(m.id); }); }}
              className="mt-2 text-[10px] text-(--color-dim) underline"
            >
              削除
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
