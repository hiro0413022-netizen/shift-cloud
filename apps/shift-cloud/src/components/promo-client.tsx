"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MAX_VIDEO_SECONDS,
  PROMO_KINDS,
  PROMO_KIND_LABELS,
  downloadName,
  formatBytes,
  formatSeconds,
  isVideoMime,
  mp4DurationSeconds,
  promoUploadError,
  resolveMime,
  type PromoKind,
} from "@/lib/promo";
import { beginPromoUpload, deletePromo, finishPromoUpload, promoShareLink } from "@/app/(staff)/promo/actions";

export type PromoItem = {
  id: string;
  kind: PromoKind;
  title: string;
  note: string | null;
  filePath: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  uploadedByName: string | null;
  createdAt: string;
  /** 表示用の署名URL（1時間） */
  viewUrl: string | null;
  canDelete: boolean;
};

const ACCEPT: Record<PromoKind, string> = {
  logo: "image/png,image/svg+xml,image/jpeg,image/webp,image/gif",
  photo: "image/*,.heic,.heif",
  video: "video/mp4,video/quicktime,video/webm,.mov,.mp4",
};

/** 動画の長さを読む。MP4/MOV は中身から、それ以外（WebM）は <video> で */
async function readVideoSeconds(file: File, mime: string): Promise<number | null> {
  if (mime === "video/mp4" || mime === "video/quicktime") {
    try {
      const sec = mp4DurationSeconds(await file.arrayBuffer());
      if (sec != null && sec > 0) return sec;
    } catch { /* 下の方法で読む */ }
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    const done = (sec: number | null) => { URL.revokeObjectURL(url); resolve(sec); };
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = url;
  });
}

async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/** 署名URLへ PUT（進み具合つき） */
function putWithProgress(url: string, file: File, mime: string, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function PromoClient({ items, variant }: { items: PromoItem[]; variant: "staff" | "admin" }) {
  const router = useRouter();
  const [filter, setFilter] = useState<PromoKind | "all">("all");
  const [showForm, setShowForm] = useState(items.length === 0);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PromoItem | null>(null);
  const [, startTransition] = useTransition();

  // 追加フォーム
  const [kind, setKind] = useState<PromoKind>("photo");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState<{ mime: string; seconds: number | null; width: number | null; height: number | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const k of PROMO_KINDS) c[k] = items.filter((i) => i.kind === k).length;
    return c;
  }, [items]);
  const shown = filter === "all" ? items : items.filter((i) => i.kind === filter);

  const formError = file && fileInfo
    ? promoUploadError({ kind, title, fileName: file.name, mime: fileInfo.mime, size: file.size, durationSec: fileInfo.seconds })
    : null;

  async function onPickFile(f: File | null) {
    setFile(f);
    setFileInfo(null);
    setMsg(null);
    if (!f) return;
    const resolved = resolveMime(f.name, f.type);
    const mime = resolved?.mime ?? f.type;
    // 名前が空なら、ファイル名（拡張子なし）を仮に入れておく
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, "").slice(0, 80));
    // 動画を選んだら種類も動画に寄せる（逆も）
    if (isVideoMime(mime) && kind !== "video") setKind("video");
    if (!isVideoMime(mime) && kind === "video") setKind("photo");
    setChecking(true);
    try {
      if (isVideoMime(mime)) {
        const seconds = await readVideoSeconds(f, mime);
        setFileInfo({ mime, seconds, width: null, height: null });
      } else {
        const size = mime === "image/heic" || mime === "image/heif" ? null : await readImageSize(f);
        setFileInfo({ mime, seconds: null, width: size?.width ?? null, height: size?.height ?? null });
      }
    } finally {
      setChecking(false);
    }
  }

  function resetForm() {
    setTitle(""); setNote(""); setFile(null); setFileInfo(null); setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function upload() {
    if (!file || !fileInfo) { setMsg({ text: "ファイルを選んでください", error: true }); return; }
    const check = { kind, title, fileName: file.name, mime: fileInfo.mime, size: file.size, durationSec: fileInfo.seconds };
    const bad = promoUploadError(check);
    if (bad) { setMsg({ text: bad, error: true }); return; }
    setProgress(0);
    setMsg(null);
    try {
      const begin = await beginPromoUpload(check);
      if ("error" in begin) { setMsg({ text: begin.error, error: true }); setProgress(null); return; }
      await putWithProgress(begin.url, file, fileInfo.mime, setProgress);
      const fin = await finishPromoUpload({
        ...check, path: begin.path, note, width: fileInfo.width, height: fileInfo.height,
      });
      if ("error" in fin) { setMsg({ text: fin.error, error: true }); setProgress(null); return; }
      setMsg({ text: `「${title.trim()}」を追加しました` });
      resetForm();
      setFilter("all");
      startTransition(() => router.refresh());
    } catch (e) {
      console.error("[promo] upload failed", e);
      setMsg({ text: "送信できませんでした。電波の良い場所でもう一度お試しください（ログインが切れている場合は再読み込みしてください）", error: true });
      setProgress(null);
    }
  }

  /** スマホの共有シート（LINE・Instagram・AirDrop 等）にファイルそのものを渡す。無理ならリンク */
  async function share(item: PromoItem) {
    setBusyId(item.id);
    setMsg(null);
    try {
      const name = downloadName(item.title, item.filePath);
      let blob: Blob | null = null;
      if (item.viewUrl) {
        const res = await fetch(item.viewUrl).catch(() => null);
        if (res?.ok) blob = await res.blob();
      }
      if (!blob) {
        const link = await promoShareLink(item.id);
        if ("url" in link) {
          const res = await fetch(link.url).catch(() => null);
          if (res?.ok) blob = await res.blob();
        }
      }
      if (blob && typeof navigator !== "undefined" && "canShare" in navigator) {
        const f = new File([blob], name, { type: item.mime });
        if (navigator.canShare({ files: [f] })) {
          await navigator.share({ files: [f], title: item.title });
          return;
        }
      }
      // ファイルを渡せない端末（パソコン等）はリンクで
      const link = await promoShareLink(item.id);
      if ("error" in link) { setMsg({ text: link.error, error: true }); return; }
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: item.title, url: link.url });
      } else {
        await navigator.clipboard.writeText(link.url);
        setMsg({ text: "この端末は共有メニューが使えないため、リンク（7日間有効）をコピーしました" });
      }
    } catch (e) {
      // 共有メニューを閉じただけ（AbortError）は何も出さない
      if ((e as { name?: string })?.name !== "AbortError") {
        console.error("[promo] share failed", e);
        setMsg({ text: "共有できませんでした。「保存」してから送ってください", error: true });
      }
    } finally {
      setBusyId(null);
    }
  }

  async function save(item: PromoItem) {
    setBusyId(item.id);
    try {
      const link = await promoShareLink(item.id);
      if ("error" in link) { setMsg({ text: link.error, error: true }); return; }
      window.location.href = link.url; // download 指定つきの署名URL＝そのまま保存される
    } finally {
      setBusyId(null);
    }
  }

  async function copyLink(item: PromoItem) {
    setBusyId(item.id);
    try {
      const link = await promoShareLink(item.id);
      if ("error" in link) { setMsg({ text: link.error, error: true }); return; }
      await navigator.clipboard.writeText(link.url);
      setMsg({ text: `「${item.title}」のリンクをコピーしました（7日間有効）` });
    } catch {
      setMsg({ text: "コピーできませんでした", error: true });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: PromoItem) {
    if (!window.confirm(`「${item.title}」を消します。よろしいですか？\n（共有済みのリンクも使えなくなります）`)) return;
    setBusyId(item.id);
    try {
      const r = await deletePromo(item.id);
      if ("error" in r) { setMsg({ text: r.error, error: true }); return; }
      setMsg({ text: `「${item.title}」を消しました` });
      if (preview?.id === item.id) setPreview(null);
      startTransition(() => router.refresh());
    } catch {
      setMsg({ text: "削除できませんでした。再読み込みしてからもう一度お試しください", error: true });
    } finally {
      setBusyId(null);
    }
  }

  const btn = "rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-xs font-medium text-zinc-700 active:bg-zinc-100 disabled:opacity-50 md:py-1.5";
  const uploading = progress != null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {variant === "staff" && <h1 className="mr-auto text-lg font-semibold tracking-tight">広報素材</h1>}
        <button
          type="button"
          onClick={() => { setShowForm((v) => !v); setMsg(null); }}
          className={`${variant === "admin" ? "" : "ml-auto"} rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white active:opacity-90`}
        >
          {showForm ? "閉じる" : "＋ 素材を追加"}
        </button>
      </div>
      <p className="text-xs leading-relaxed text-zinc-500">
        お店のロゴ・写真・{MAX_VIDEO_SECONDS}秒までの動画をみんなで使えます。
        「共有」でLINE・Instagramなどへそのまま送れます（スマホ）。パソコンでは「保存」してから使ってください。
      </p>

      {showForm && (
        <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-1">
            {PROMO_KINDS.map((k) => (
              <button key={k} type="button" disabled={uploading}
                onClick={() => { setKind(k); if (file) void onPickFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                className={`flex-1 rounded-md py-2 text-sm ${kind === k ? "bg-white font-semibold text-brand shadow-sm" : "text-zinc-500"}`}>
                {PROMO_KIND_LABELS[k]}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              ファイル{kind === "video" ? `（${MAX_VIDEO_SECONDS}秒まで・50MBまで）` : "（50MBまで）"}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT[kind]}
              disabled={uploading}
              onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-light file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand"
            />
          </label>
          {checking && <p className="text-xs text-zinc-500">ファイルを確認しています…</p>}
          {file && fileInfo && (
            <p className="text-xs text-zinc-500">
              {formatBytes(file.size)}
              {fileInfo.seconds != null && ` ・ ${formatSeconds(fileInfo.seconds)}`}
              {fileInfo.width && fileInfo.height ? ` ・ ${fileInfo.width}×${fileInfo.height}` : ""}
            </p>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">名前</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={uploading} maxLength={80}
              placeholder="例：FRANK GOLF ロゴ（白抜き）"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base focus:border-brand focus:outline-none md:text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">メモ（任意）</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} disabled={uploading} maxLength={200}
              placeholder="例：Instagram用・正方形"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-base focus:border-brand focus:outline-none md:text-sm" />
          </label>
          {formError && <p className="text-sm font-medium text-red-600">{formError}</p>}
          {uploading && (
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full bg-brand transition-all" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void upload()}
              disabled={uploading || checking || !file || !!formError}
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40">
              {uploading ? `送信中… ${Math.round((progress ?? 0) * 100)}%` : "追加する"}
            </button>
            {!uploading && file && (
              <button type="button" onClick={resetForm} className="text-sm text-zinc-500 underline">やり直す</button>
            )}
          </div>
        </div>
      )}

      {msg && (
        <p role={msg.error ? "alert" : "status"}
          className={`rounded-lg px-3 py-2 text-sm ${msg.error ? "border border-red-200 bg-red-50 text-red-700" : "bg-brand-light text-brand"}`}>
          {msg.text}
        </p>
      )}

      <div className="flex gap-1 overflow-x-auto">
        {(["all", ...PROMO_KINDS] as const).map((k) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${filter === k ? "bg-brand text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200"}`}>
            {k === "all" ? "すべて" : PROMO_KIND_LABELS[k]} <span className="text-xs opacity-80">{counts[k] ?? 0}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-400">
          まだ素材がありません。「＋ 素材を追加」から入れてください
        </p>
      ) : (
        <ul className={`grid gap-3 ${variant === "admin"
          ? "grid-cols-[repeat(2,minmax(0,1fr))] md:grid-cols-3 xl:grid-cols-4"
          : "grid-cols-[repeat(2,minmax(0,1fr))]"}`}>
          {shown.map((it) => (
            <li key={it.id} className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <button type="button" onClick={() => setPreview(it)} aria-label={`${it.title}を大きく見る`}
                className={`relative flex aspect-square items-center justify-center overflow-hidden ${
                  it.kind === "logo"
                    ? "bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px]"
                    : "bg-zinc-100"}`}>
                {!it.viewUrl ? (
                  <span className="text-xs text-zinc-400">表示できません</span>
                ) : it.kind === "video" ? (
                  <>
                    <video src={`${it.viewUrl}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      ▶ {formatSeconds(it.durationSec)}
                    </span>
                  </>
                ) : it.mime === "image/heic" || it.mime === "image/heif" ? (
                  <span className="px-2 text-center text-xs text-zinc-500">HEIC写真<br />（保存すると見られます）</span>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.viewUrl} alt={it.title} loading="lazy"
                    className={`h-full w-full ${it.kind === "logo" ? "object-contain p-3" : "object-cover"}`} />
                )}
              </button>
              <div className="flex flex-1 flex-col gap-1 p-2.5">
                <p className="line-clamp-2 text-sm font-semibold leading-snug">{it.title}</p>
                {it.note && <p className="line-clamp-2 text-[11px] text-zinc-500">{it.note}</p>}
                <p className="mt-auto text-[10px] text-zinc-400">
                  {PROMO_KIND_LABELS[it.kind]} ・ {formatBytes(it.size)}
                  {it.width && it.height ? ` ・ ${it.width}×${it.height}` : ""}
                  <br />
                  {fmtDate(it.createdAt)} {it.uploadedByName ?? ""}
                </p>
                <div className="mt-1 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-1">
                  <button type="button" disabled={busyId === it.id} onClick={() => void share(it)}
                    className={`${btn} border-brand text-brand`}>
                    {busyId === it.id ? "準備中…" : "共有"}
                  </button>
                  <button type="button" disabled={busyId === it.id} onClick={() => void save(it)} className={btn}>保存</button>
                  <button type="button" disabled={busyId === it.id} onClick={() => void copyLink(it)} className={btn}>リンク</button>
                  {it.canDelete ? (
                    <button type="button" disabled={busyId === it.id} onClick={() => void remove(it)}
                      className={`${btn} text-red-600`}>削除</button>
                  ) : <span />}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 大きく見る */}
      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90" role="dialog" aria-modal="true">
          <div className="flex items-center gap-2 p-3 text-white">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{preview.title}</p>
            <button type="button" onClick={() => void share(preview)} className="rounded-lg bg-white/15 px-3 py-2 text-sm">共有</button>
            <button type="button" onClick={() => void save(preview)} className="rounded-lg bg-white/15 px-3 py-2 text-sm">保存</button>
            <button type="button" onClick={() => setPreview(null)} aria-label="閉じる" className="h-10 w-10 rounded-lg text-2xl">×</button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-3" onClick={() => setPreview(null)}>
            {preview.viewUrl && (preview.kind === "video" ? (
              <video src={preview.viewUrl} controls autoPlay playsInline className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.viewUrl} alt={preview.title}
                className={`max-h-full max-w-full object-contain ${preview.kind === "logo" ? "bg-white p-4" : ""}`}
                onClick={(e) => e.stopPropagation()} />
            ))}
          </div>
          {preview.note && <p className="p-3 text-center text-xs text-white/70">{preview.note}</p>}
        </div>
      )}
    </div>
  );
}
