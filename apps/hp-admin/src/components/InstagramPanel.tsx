"use client";
import { useCallback, useEffect, useState } from "react";
import { arpc, type SiteData, type SiteInfo } from "@/lib/api";
import { Empty, Spinner, fmtDate, type ToastApi } from "./ui";

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
  }
}

function useInstagramEmbed(dep: unknown) {
  useEffect(() => {
    const run = () => window.instgrm?.Embeds.process();
    if (window.instgrm) {
      run();
      return;
    }
    if (!document.getElementById("ig-embed-js")) {
      const s = document.createElement("script");
      s.id = "ig-embed-js";
      s.async = true;
      s.src = "https://www.instagram.com/embed.js";
      s.onload = run;
      document.body.appendChild(s);
    }
  }, [dep]);
}

export default function InstagramPanel({ site, toast, onError }: { site: SiteInfo; toast: ToastApi; onError: (e: unknown) => void }) {
  const [data, setData] = useState<SiteData | null>(null);
  const [url, setUrl] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => arpc<SiteData>("hp_admin_site", { p_site: site.code }).then(setData).catch(onError), [site.code, onError]);
  useEffect(() => {
    load();
  }, [load]);
  useInstagramEmbed(data?.instagram.length);

  if (!data) return <Spinner />;
  const shown = data.instagram.filter((i) => i.visible).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-navy">Instagram の投稿をホームページに出す</h2>
        <p className="text-[13px] text-soft">
          インスタに投稿したら、その投稿のURLをここに貼るだけでホームページのInstagram欄に並びます（新しい順・最大9件表示）。
        </p>
      </div>

      <form
        className="card space-y-3 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await arpc("hp_admin_add_instagram", { p_site: site.code, p_url: url, p_caption: memo, p_posted_on: null });
            setUrl("");
            setMemo("");
            toast.ok("追加しました。1分ほどでホームページに出ます");
            await load();
          } catch (err) {
            onError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div>
          <label className="label">投稿のURL</label>
          <input
            className="field"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.instagram.com/p/xxxxxxxx/"
            inputMode="url"
            required
          />
          <p className="mt-1 text-[11px] text-soft">インスタアプリで投稿の「…」または紙飛行機 →「リンクをコピー」→ ここに貼り付け。リールもOK。</p>
        </div>
        <div>
          <label className="label">メモ（社内用・任意）</label>
          <input className="field" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="例：9月キャンペーン告知" />
        </div>
        <button className="btn-gold" disabled={busy || !url.trim()}>
          {busy ? "追加中…" : "＋ ホームページに追加"}
        </button>
      </form>

      <div className="flex items-center text-sm">
        <span className="font-semibold">登録済み {data.instagram.length}件</span>
        <span className="ml-2 text-xs text-soft">（表示中 {shown}件）</span>
      </div>

      {data.instagram.length === 0 ? (
        <Empty>まだ登録されていません</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.instagram.map((i) => (
            <div key={i.id} className={`card overflow-hidden ${i.visible ? "" : "opacity-60"}`}>
              <div className="max-h-[520px] overflow-hidden bg-bg">
                <blockquote
                  className="instagram-media"
                  data-instgrm-permalink={i.permalink}
                  data-instgrm-version="14"
                  style={{ margin: 0, minWidth: 0, width: "100%", border: 0 }}
                >
                  <a href={i.permalink} target="_blank" rel="noopener" className="block p-4 text-xs text-navy-2 underline">
                    {i.permalink}
                  </a>
                </blockquote>
              </div>
              <div className="space-y-2 p-3">
                {i.caption && <div className="text-[13px] font-semibold">{i.caption}</div>}
                <div className="text-[11px] text-soft">
                  {i.created_by}・{fmtDate(i.created_at)}
                </div>
                <div className="flex gap-2">
                  <button
                    className="btn-ghost px-3 py-1.5 text-xs"
                    onClick={async () => {
                      try {
                        await arpc("hp_admin_update_instagram", { p_site: site.code, p_id: i.id, p_visible: !i.visible, p_delete: false });
                        toast.ok(i.visible ? "ホームページから隠しました" : "ホームページに出しました");
                        await load();
                      } catch (e) {
                        onError(e);
                      }
                    }}
                  >
                    {i.visible ? "隠す" : "表示する"}
                  </button>
                  <button
                    className="btn-danger px-3 py-1.5 text-xs"
                    onClick={async () => {
                      if (!confirm("この投稿を一覧から外しますか？（インスタの投稿自体は消えません）")) return;
                      try {
                        await arpc("hp_admin_update_instagram", { p_site: site.code, p_id: i.id, p_visible: null, p_delete: true });
                        toast.ok("外しました");
                        await load();
                      } catch (e) {
                        onError(e);
                      }
                    }}
                  >
                    外す
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
