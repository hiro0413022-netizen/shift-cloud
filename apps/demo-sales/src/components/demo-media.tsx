"use client";

// デモ生成フォームの「写真」「基調色」入力。
//  - 写真: 署名URLでブラウザから直PUT（サーバーアクションのbody上限を回避 / Lesson OSと同型）。
//          送信前にcanvasで縮小（長辺1600px・JPEG 0.85）— スマホ写真をそのまま貼っても軽い
//  - 値は hidden input に入れて、既存の <form action={generateDemo}> にそのまま乗せる
//  - 基調色: カラーピッカー＋業種系プリセット（HEXを覚えなくてよい）

import { useRef, useState } from "react";
import { createDemoImageUploadUrl } from "@/app/actions";
import { COLOR_PRESETS } from "@/lib/types";
import { inputCls } from "./ui";

const MAX_EDGE = 1600;

/** 画像を縮小してJPEG化（透過PNGは白背景に載る）。失敗時は元ファイルを返す */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

async function upload(prospectId: string, file: File): Promise<{ url?: string; error?: string }> {
  const blob = await shrink(file);
  const type = blob.type || "image/jpeg";
  const r = await createDemoImageUploadUrl(prospectId, type, blob.size);
  if (!r.url || !r.publicUrl) return { error: r.error ?? "アップロードURLの発行に失敗しました" };
  const res = await fetch(r.url, { method: "PUT", headers: { "Content-Type": type }, body: blob });
  if (!res.ok) return { error: `アップロードに失敗しました（${res.status}）` };
  return { url: r.publicUrl };
}

/** 単一画像（ヘッダー / 院長写真） */
export function ImageField({
  prospectId,
  name,
  label,
  hint,
  initial,
}: {
  prospectId: string;
  name: string;
  label: string;
  hint?: string;
  initial?: string;
}) {
  const [url, setUrl] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setErr("");
    const r = await upload(prospectId, file);
    if (r.error) setErr(r.error);
    else setUrl(r.url!);
    setBusy(false);
    if (ref.current) ref.current.value = "";
  };

  return (
    <div className="text-xs text-(--color-dim)">
      <p className="mb-1">{label}</p>
      <input type="hidden" name={name} value={url} />
      <div className="flex items-center gap-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-16 w-24 rounded-lg border border-(--color-line) object-cover" />
        ) : (
          <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed border-(--color-line) text-[10px]">
            なし
          </div>
        )}
        <div className="flex flex-col gap-1">
          <input
            ref={ref}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => pick(e.target.files?.[0])}
            className="text-xs"
          />
          {url && (
            <button type="button" onClick={() => setUrl("")} className="w-fit text-xs text-(--color-danger) hover:underline">
              削除
            </button>
          )}
        </div>
      </div>
      {busy && <p className="mt-1">アップロード中…</p>}
      {err && <p className="mt-1 text-red-500">{err}</p>}
      {hint && <p className="mt-1 text-[11px]">{hint}</p>}
    </div>
  );
}

/** 院内・診察風景ギャラリー（最大6枚・キャプション付き） */
export function GalleryField({
  prospectId,
  name,
  initial,
}: {
  prospectId: string;
  name: string;
  initial?: { url: string; caption?: string }[];
}) {
  const [items, setItems] = useState(initial ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setErr("");
    const next = [...items];
    for (const file of Array.from(files).slice(0, 6 - items.length)) {
      const r = await upload(prospectId, file);
      if (r.error) setErr(r.error);
      else next.push({ url: r.url!, caption: "" });
    }
    setItems(next);
    setBusy(false);
    if (ref.current) ref.current.value = "";
  };

  return (
    <div className="text-xs text-(--color-dim) sm:col-span-2">
      <p className="mb-1">院内・診察風景の写真（最大6枚・院から提供された写真やフリー素材のみ／現サイトからの転載は不可）</p>
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <div className="grid gap-2 sm:grid-cols-3">
        {items.map((it, i) => (
          <div key={it.url} className="rounded-lg border border-(--color-line) p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={it.url} alt="" className="mb-1 h-24 w-full rounded object-cover" />
            <input
              value={it.caption ?? ""}
              onChange={(e) =>
                setItems(items.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))
              }
              placeholder="キャプション（例: 待合室）"
              className={`${inputCls} px-2 py-1 text-xs`}
            />
            <button
              type="button"
              onClick={() => setItems(items.filter((_, j) => j !== i))}
              className="mt-1 text-xs text-(--color-danger) hover:underline"
            >
              削除
            </button>
          </div>
        ))}
      </div>
      {items.length < 6 && (
        <input
          ref={ref}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy}
          onChange={(e) => add(e.target.files)}
          className="mt-2 text-xs"
        />
      )}
      {busy && <p className="mt-1">アップロード中…</p>}
      {err && <p className="mt-1 text-red-500">{err}</p>}
    </div>
  );
}

/** 基調色: カラーピッカー＋プリセット（HEX直接入力も可） */
export function ColorField({
  name,
  initial,
  templateColor,
}: {
  name: string;
  initial?: string;
  templateColor: string;
}) {
  const [value, setValue] = useState(initial ?? "");
  const current = value || templateColor;

  return (
    <div className="text-xs text-(--color-dim)">
      <p className="mb-1">基調色（空=業種標準）</p>
      <input type="hidden" name={name} value={value} />
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={current}
          onChange={(e) => setValue(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-(--color-line) bg-white"
          aria-label="基調色を選ぶ"
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`${templateColor}（業種標準）`}
          className={`${inputCls} max-w-36`}
        />
        {value && (
          <button type="button" onClick={() => setValue("")} className="text-xs hover:underline">
            業種標準に戻す
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {COLOR_PRESETS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.label}
            onClick={() => setValue(c.value)}
            style={{ background: c.value }}
            className={`h-7 w-7 rounded-full border-2 ${
              current.toLowerCase() === c.value.toLowerCase() ? "border-(--color-txt)" : "border-white"
            } shadow-sm`}
          />
        ))}
      </div>
    </div>
  );
}
