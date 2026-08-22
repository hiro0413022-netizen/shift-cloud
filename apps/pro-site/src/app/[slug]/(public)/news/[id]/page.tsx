import Link from "next/link";
import { notFound } from "next/navigation";
import { getNews, getPro } from "@/lib/data";
import { fmtDateJa } from "@/lib/jst";

export const dynamic = "force-dynamic";

export default async function NewsDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const pro = await getPro(slug);
  if (!pro) notFound();
  const n = await getNews(pro.id, id);
  if (!n) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-3 flex items-center gap-3 text-xs">
        <span className="text-(--color-dim)">{fmtDateJa(n.published_at)}</span>
        <span className="rounded-sm border border-(--color-gold) px-2 py-0.5 text-(--color-gold)">{n.category}</span>
      </div>
      <h1 className="mb-6 text-2xl font-black leading-snug">{n.title}</h1>
      {n.body ? <div className="whitespace-pre-wrap text-[15px] leading-8">{n.body}</div> : null}
      {n.link_url ? (
        <p className="mt-6">
          <a href={n.link_url} target="_blank" rel="noopener noreferrer" className="text-(--color-gold) underline underline-offset-4">
            関連リンクを見る →
          </a>
        </p>
      ) : null}
      <div className="mt-10 border-t border-(--color-line) pt-6">
        <Link href={`/${pro.slug}/news`} className="sec-title text-xs text-(--color-dim) hover:text-(--color-gold)">← NEWS一覧へ</Link>
      </div>
    </article>
  );
}
