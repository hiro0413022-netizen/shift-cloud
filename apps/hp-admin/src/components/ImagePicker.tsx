"use client";
import { useRef, useState } from "react";
import { uploadImage } from "@/lib/api";

/** 写真を選ぶ（端末から / 過去にアップした写真から） */
export default function ImagePicker({
  site,
  media,
  onPicked,
  onError,
  label = "写真を変える",
  compact,
}: {
  site: string;
  media: { url: string }[];
  onPicked: (url: string) => void | Promise<void>;
  onError: (e: unknown) => void;
  label?: string;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [lib, setLib] = useState(false);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={compact ? "btn-ghost px-3 py-1.5 text-xs" : "btn-primary"} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "アップロード中…" : `📤 ${label}`}
        </button>
        {media.length > 0 && (
          <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setLib(true)}>
            アップ済みから選ぶ
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            const url = await uploadImage(site, f);
            await onPicked(url);
          } catch (err) {
            onError(err);
          } finally {
            setBusy(false);
          }
        }}
      />
      {lib && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" onClick={() => setLib(false)}>
          <div className="max-h-[80dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center">
              <h3 className="text-sm font-bold">アップ済みの写真</h3>
              <button className="ml-auto text-sm text-soft" onClick={() => setLib(false)}>
                閉じる
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {media.map((m) => (
                <button
                  key={m.url}
                  className="aspect-square overflow-hidden rounded-lg border border-line hover:ring-2 hover:ring-gold"
                  onClick={async () => {
                    setLib(false);
                    try {
                      await onPicked(m.url);
                    } catch (err) {
                      onError(err);
                    }
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
