"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Video } from "@/lib/online/data";
import { SectionTitle, Toast, useToast, copyText, fmtAgo } from "../ui";
import { saveVideo, deleteVideo } from "../online-actions";
import { videoBlock } from "@/lib/online/reply";

type Form = { id: string | null; url: string; title: string; tags: string; note: string };
const EMPTY: Form = { id: null, url: "", title: "", tags: "", note: "" };

function thumb(url: string) {
  const id = url.match(/youtu\.be\/([\w-]+)/)?.[1];
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
}

export default function VideosClient({ videos }: { videos: Video[] }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, start] = useTransition();
  const words = q.split(/\s+/).filter(Boolean);
  const list = videos.filter((v) => words.every((w) => `${v.title} ${v.tags.join(" ")} ${v.note ?? ""}`.includes(w)));

  const save = () =>
    form &&
    start(async () => {
      const r = await saveVideo({
        id: form.id, url: form.url, title: form.title, note: form.note,
        tags: form.tags.split(/[\s,、]+/).filter(Boolean),
      });
      if (!r.ok) return toast.show(r.error);
      setForm(null);
      toast.show("保存しました");
      router.refresh();
    });

  const remove = (id: string) =>
    start(async () => {
      if (!confirm("この動画をライブラリから外しますか？")) return;
      const r = await deleteVideo(id);
      if (!r.ok) return toast.show(r.error);
      setForm(null);
      router.refresh();
    });

  return (
    <div>
      <SectionTitle
        en="Videos"
        ja={`動画ライブラリ — 返信に貼るYouTube（${videos.length}本）`}
        right={<button className="rr-btn-ink" onClick={() => setForm({ ...EMPTY })}>＋ 動画を追加</button>}
      />
      <input className="rr-input mb-4 !py-2.5" placeholder="タイトル・タグで探す（スペースで絞り込み）" value={q} onChange={(e) => setQ(e.target.value)} />

      {form && (
        <div className="rr-card rr-pop mb-4 space-y-2.5 p-4">
          <div className="text-sm font-semibold">{form.id ? "動画を編集" : "動画を追加"}</div>
          <input className="rr-input !py-2" placeholder="YouTubeのURL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <input className="rr-input !py-2" placeholder="タイトル（返信にはこの表記のまま入ります）" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className="rr-input !py-2" placeholder="タグ（スペース区切り 例：右足 フィニッシュ 初心者）" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          <textarea className="rr-input min-h-[64px]" placeholder="メモ（どんな人に送るか など）" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <div className="flex gap-2">
            {form.id && <button className="rr-btn-ghost text-(--rr-wait)" onClick={() => remove(form.id!)}>外す</button>}
            <button className="rr-btn-ghost ml-auto" onClick={() => setForm(null)}>やめる</button>
            <button className="rr-btn-ink" disabled={busy} onClick={save}>保存</button>
          </div>
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((v) => {
          const img = thumb(v.url);
          return (
            <li key={v.id} className="rr-card flex flex-col overflow-hidden">
              <a href={v.url} target="_blank" rel="noreferrer" className="relative block aspect-video bg-(--rr-ink)">
                {img && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt="" loading="lazy" className="h-full w-full object-cover opacity-95" />
                )}
                <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white">{v.useCount}回使用</span>
              </a>
              <div className="flex flex-1 flex-col p-3">
                <div className="line-clamp-2 text-[13.5px] font-semibold leading-snug">{v.title}</div>
                {v.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {v.tags.map((t) => <span key={t} className="rounded bg-(--rr-gold-soft) px-1.5 text-[11px] text-[#8a6d40]">{t}</span>)}
                  </div>
                )}
                <div className="mt-auto flex items-center gap-2 pt-3 text-[11px] text-(--color-faint)">
                  <span>最終 {fmtAgo(v.lastUsedAt)}</span>
                  <button
                    className="ml-auto rounded-lg border border-(--color-line) px-2 py-1 text-(--color-dim)"
                    onClick={async () => toast.show((await copyText(videoBlock(v))) ? "タイトルとURLをコピーしました" : "コピーできませんでした")}
                  >
                    コピー
                  </button>
                  <button
                    className="rounded-lg border border-(--color-line) px-2 py-1 text-(--color-dim)"
                    onClick={() => {
                      setForm({ id: v.id, url: v.url, title: v.title, tags: v.tags.join(" "), note: v.note ?? "" });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    編集
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {!list.length && <p className="rr-card p-8 text-center text-sm text-(--color-dim)">見つかりません</p>}
      <Toast msg={toast.msg} />
    </div>
  );
}
