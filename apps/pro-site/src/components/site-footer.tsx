"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";

/**
 * フッター。コピーライト部分を「3秒以内に5回タップ」で管理ログインへ（隠しコマンド）。
 * リンクとしては一切露出しない。
 */
export default function SiteFooter({ slug, name, instagram, x, youtube, hasContact }: {
  slug: string;
  name: string;
  instagram: string | null;
  x: string | null;
  youtube: string | null;
  hasContact: boolean;
}) {
  const router = useRouter();
  const taps = useRef<number[]>([]);

  function secretTap() {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      router.push(`/${slug}/admin`);
    }
  }

  return (
    <footer className="bg-(--color-ink) px-4 py-10 text-center text-white">
      <p className="sec-title mb-4 text-sm text-(--color-gold-2)">{name} OFFICIAL SITE</p>
      <div className="mb-6 flex items-center justify-center gap-5 text-sm">
        {instagram ? (
          <a href={`https://www.instagram.com/${instagram}/`} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
            Instagram
          </a>
        ) : null}
        {x ? (
          <a href={`https://x.com/${x}`} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
            X
          </a>
        ) : null}
        {youtube ? (
          <a href={youtube} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
            YouTube
          </a>
        ) : null}
      </div>
      {hasContact ? (
        <div className="mb-6">
          <Link
            href={`/${slug}/contact`}
            className="inline-block rounded-full border border-(--color-gold-2) px-6 py-2.5 text-sm font-bold text-(--color-gold-2) transition hover:bg-(--color-gold-2) hover:text-(--color-ink)"
          >
            お問い合わせ
          </Link>
        </div>
      ) : null}
      <p className="select-none text-xs text-neutral-400" onClick={secretTap}>
        © {new Date().getFullYear()} {name}. All Rights Reserved.
      </p>
    </footer>
  );
}
