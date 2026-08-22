"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
  }
}

/**
 * Instagram公式の埋め込み（embed.js）。Meta API不要＝投稿URLだけで表示できる。
 * ※非公開アカウントや削除済み投稿は表示されない。
 */
export default function InstagramEmbed({ urls }: { urls: string[] }) {
  useEffect(() => {
    const id = "ig-embed-js";
    if (!document.getElementById(id)) {
      const s = document.createElement("script");
      s.id = id;
      s.async = true;
      s.src = "https://www.instagram.com/embed.js";
      document.body.appendChild(s);
    } else {
      window.instgrm?.Embeds.process();
    }
  }, [urls]);

  if (urls.length === 0) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {urls.map((u) => (
        <blockquote
          key={u}
          className="instagram-media"
          data-instgrm-permalink={u.split("?")[0]}
          data-instgrm-version="14"
          style={{ margin: "0 auto", maxWidth: 540, minWidth: 280, width: "100%" }}
        >
          <a href={u} target="_blank" rel="noopener noreferrer">
            Instagramの投稿を見る
          </a>
        </blockquote>
      ))}
    </div>
  );
}
