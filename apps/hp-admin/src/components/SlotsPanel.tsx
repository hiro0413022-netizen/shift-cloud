"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { arpc, type SiteData, type SiteInfo, type Slot } from "@/lib/api";
import ImagePicker from "./ImagePicker";
import { Empty, Spinner, fmtDate, type ToastApi } from "./ui";

export default function SlotsPanel({ site, toast, onError }: { site: SiteInfo; toast: ToastApi; onError: (e: unknown) => void }) {
  const [data, setData] = useState<SiteData | null>(null);
  const [page, setPage] = useState<string>("");

  const load = useCallback(() => arpc<SiteData>("hp_admin_site", { p_site: site.code }).then(setData).catch(onError), [site.code, onError]);
  useEffect(() => {
    load();
  }, [load]);

  const pages = useMemo(() => Array.from(new Set((data?.slots ?? []).map((s) => s.page_label))), [data]);
  useEffect(() => {
    if (pages.length && !pages.includes(page)) setPage(pages[0]);
  }, [pages, page]);

  if (!data) return <Spinner />;
  if (data.slots.length === 0)
    return <Empty>このサイトの「差し替えできる写真・文言」はまだ用意されていません（表示の接続と一緒に用意します）。</Empty>;

  const save = async (s: Slot, value: string | null) => {
    try {
      await arpc("hp_admin_save_slot", { p_site: site.code, p_key: s.key, p_value: value ?? "" });
      toast.ok(value ? "保存しました。1分ほどでホームページに反映されます" : "元に戻しました");
      await load();
    } catch (e) {
      onError(e);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-navy">写真・文言の差し替え</h2>
        <p className="text-[13px] text-soft">ページを選んで、変えたい場所の写真や文字を入れ替えます。保存すると約1分でホームページに出ます。</p>
      </div>
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => setPage(p)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${p === page ? "bg-navy text-white" : "border border-line bg-white text-soft"}`}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.slots
          .filter((s) => s.page_label === page)
          .map((s) =>
            s.kind === "image" ? (
              <ImageSlot key={s.key} s={s} site={site.code} media={data.media} onSave={save} onError={onError} />
            ) : (
              <TextSlot key={s.key} s={s} onSave={save} />
            ),
          )}
      </div>
    </div>
  );
}

function Meta({ s }: { s: Slot }) {
  return s.value ? (
    <div className="text-[11px] text-soft">
      変更済み：{s.updated_by}・{fmtDate(s.updated_at)}
    </div>
  ) : (
    <div className="text-[11px] text-soft">最初の状態のまま</div>
  );
}

function ImageSlot({
  s,
  site,
  media,
  onSave,
  onError,
}: {
  s: Slot;
  site: string;
  media: { url: string }[];
  onSave: (s: Slot, v: string | null) => Promise<void>;
  onError: (e: unknown) => void;
}) {
  const url = s.value || s.default_value || "";
  return (
    <div className="card overflow-hidden">
      <div className="aspect-[16/10] bg-bg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url && <img src={url} alt={s.label} className="h-full w-full object-cover" loading="lazy" />}
      </div>
      <div className="space-y-2 p-3">
        <div className="text-sm font-semibold leading-snug">{s.label}</div>
        <Meta s={s} />
        <div className="flex flex-wrap items-center gap-2">
          <ImagePicker site={site} media={media} onPicked={(u) => onSave(s, u)} onError={onError} compact />
          {s.value && (
            <button
              className="text-xs text-soft underline"
              onClick={() => {
                if (confirm("最初の写真に戻しますか？")) onSave(s, null);
              }}
            >
              元に戻す
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TextSlot({ s, onSave }: { s: Slot; onSave: (s: Slot, v: string | null) => Promise<void> }) {
  const current = s.value ?? s.default_value ?? "";
  const [v, setV] = useState(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(current), [current]);
  const dirty = v !== current;
  return (
    <div className="card space-y-2 p-3 sm:col-span-2 lg:col-span-3">
      <div className="text-sm font-semibold">{s.label}</div>
      {s.help && <div className="text-[11px] text-soft">{s.help}</div>}
      {s.kind === "longtext" || current.includes("\n") ? (
        <textarea className="field min-h-24" value={v} onChange={(e) => setV(e.target.value)} />
      ) : (
        <input className="field" value={v} onChange={(e) => setV(e.target.value)} />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn-primary"
          disabled={!dirty || busy}
          onClick={async () => {
            setBusy(true);
            await onSave(s, v.trim() === (s.default_value ?? "").trim() ? null : v);
            setBusy(false);
          }}
        >
          {busy ? "保存中…" : "保存"}
        </button>
        {dirty && (
          <button className="text-xs text-soft underline" onClick={() => setV(current)}>
            変更をやめる
          </button>
        )}
        {s.value && !dirty && (
          <button
            className="text-xs text-soft underline"
            onClick={() => {
              if (confirm("最初の文言に戻しますか？")) onSave(s, null);
            }}
          >
            元に戻す
          </button>
        )}
        <div className="ml-auto">
          <Meta s={s} />
        </div>
      </div>
    </div>
  );
}
