import Link from "next/link";
import { notFound } from "next/navigation";
import { getPro, listNews } from "@/lib/data";
import { fmtDateJa } from "@/lib/jst";

export const dynamic = "force-dynamic";
export const metadata = { title: "NEWS" };

export default async function NewsListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pro = await getPro(slug);
  if (!pro) notFound();
  const [news, media] = await Promise.all([listNews(pro.id, "news"), listNews(pro.id, "media")]);
  const all = [...news, ...media].sort((a, b) => (a.published_at < b.published_at ? 1 : -1));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="sec-title mb-8 text-3xl font-bold">NEWS</h1>
      {all.length === 0 ? (
        <p className="text-sm text-(--color-dim)">ニュースはまだありません。</p>
      ) : (
        <ul className="divide-y divide-(--color-line) border-y border-(--color-line)">
          {all.map((n) => (
            <li key={n.id}>
              <Link href={`/${pro.slug}/news/${n.id}`} className="block py-4 hover:bg-(--color-panel)">
                <div className="mb-1 flex items-center gap-3 text-xs">
                  <span className="text-(--color-dim)">{fmtDateJa(n.published_at)}</span>
                  <span className={`rounded-sm border px-2 py-0.5 ${n.kind === "media" ? "border-(--color-line) text-(--color-dim)" : "border-(--color-gold) text-(--color-gold)"}`}>
                    {n.category}
                  </span>
                </div>
                <p className="font-bold">{n.title}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
