"use client";

import { useState } from "react";

export type PublicLink = { slug: string; name: string; active: boolean; url: string };

/**
 * 公開ページのURL一覧（DECISIONS #55）。
 * 公式LINEのリッチメニュー・トークに貼るURLをここからコピーできるようにする
 * （毎回URLを思い出す/探す手間をなくすため）。
 */
export function PublicLinks({ links }: { links: PublicLink[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  if (links.length === 0) return null;

  return (
    <div className="rounded-xl border border-(--color-line) bg-white p-4">
      <p className="text-sm font-semibold">お客様用の予約ページ（公式LINEに貼るURL）</p>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.slug} className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{l.name}</span>
            {!l.active && (
              <span className="rounded bg-(--color-panel-2) px-1.5 py-0.5 text-[11px] text-(--color-dim)">受付停止中</span>
            )}
            <code className="min-w-0 flex-1 truncate rounded-md bg-(--color-panel-2) px-2 py-1.5 text-[12px] text-(--color-dim)">
              {l.url}
            </code>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(l.url);
                setCopied(l.slug);
                setTimeout(() => setCopied(null), 1500);
              }}
              className="rounded-lg border border-(--color-line) px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-(--color-panel-2)"
            >
              {copied === l.slug ? "コピーしました" : "URLをコピー"}
            </button>
            <a
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-(--color-line) px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-(--color-panel-2)"
            >
              開く ↗
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
