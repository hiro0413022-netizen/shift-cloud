"use client";

import { useState } from "react";

// ============================================================
// プロ本人が写真を選んでアップロードする入力欄（管理画面のプロフィール）。
// スマホの写真は 5〜10MB・HEIC のことが多く、Vercel の受け口（約4.5MB）を超える。
// → 選んだ瞬間にブラウザ側で縮小して JPEG に変換してから送る（HEICもJPEGになる）。
//   縮小に失敗したら元のファイルのまま送る（サーバー側で大きさを検査して案内を出す）。
// ============================================================

async function shrink(file: File, maxEdge: number): Promise<File | null> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.86));
    if (!blob) return null;
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return null;
  }
}

export function PhotoUpload({ name = "image", maxEdge, buttonLabel }: { name?: string; maxEdge: number; buttonLabel: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      setPreview(null);
      return;
    }
    setBusy(true);
    const small = await shrink(file, maxEdge);
    if (small) {
      try {
        const dt = new DataTransfer();
        dt.items.add(small);
        input.files = dt.files;
      } catch {
        // DataTransfer 非対応の古いブラウザ → 元ファイルのまま送る
      }
    }
    setPreview(URL.createObjectURL(small ?? file));
    setBusy(false);
  }

  return (
    <div>
      <input type="file" name={name} accept="image/*" required onChange={onChange} className="adm-input" />
      {busy ? <p className="mt-1 text-[11px] text-(--color-dim)">写真を整えています…</p> : null}
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="選んだ写真" className="mt-2 max-h-48 rounded-lg border border-(--color-line) object-contain" />
      ) : null}
      <button type="submit" disabled={busy} className="adm-btn mt-3 bg-(--color-ink) text-white disabled:opacity-50">
        {busy ? "準備中…" : buttonLabel}
      </button>
    </div>
  );
}
