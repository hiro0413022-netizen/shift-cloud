import Link from "next/link";
import { notFound } from "next/navigation";
import InstagramEmbed from "@/components/instagram-embed";
import SponsorGrid from "@/components/sponsor-grid";
import { getPro, listInstagram, listNews, listResults, listSchedule, listSponsors } from "@/lib/data";
import { fmtDateJa, fmtSpanJa } from "@/lib/jst";

export const dynamic = "force-dynamic";

function SectionTitle({ en, ja }: { en: string; ja: string }) {
  return (
    <div className="mb-5 flex items-baseline gap-3">
      <h2 className="sec-title text-2xl font-bold">{en}</h2>
      <span className="text-xs text-(--color-dim)">{ja}</span>
      <span className="ml-2 h-px flex-1 bg-(--color-line)" />
    </div>
  );
}

export default async function TopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pro = await getPro(slug);
  if (!pro) notFound();

  const [news, media, schedule, results, insta, sponsors] = await Promise.all([
    listNews(pro.id, "news", 3),
    listNews(pro.id, "media", 3),
    listSchedule(pro.id, 3),
    listResults(pro.id, 3),
    listInstagram(pro.id, 4),
    listSponsors(pro.id),
  ]);
  const base = `/${pro.slug}`;

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden bg-(--color-ink) text-white">
        {pro.hero_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pro.hero_image_url} alt={pro.name} className="absolute inset-0 h-full w-full object-cover opacity-50" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_70%_20%,rgba(176,141,63,0.35),transparent_70%)]" />
        )}
        <div className="relative mx-auto max-w-5xl px-4 py-20 md:py-28">
          <p className="sec-title mb-2 text-xs uppercase text-(--color-gold-2)">Professional Golfer</p>
          <h1 className="text-4xl font-black tracking-wide md:text-6xl">{pro.name}</h1>
          {pro.name_en ? <p className="sec-title mt-2 text-sm uppercase text-neutral-300">{pro.name_en}</p> : null}
          {pro.catchphrase ? <p className="mt-6 max-w-xl text-sm leading-relaxed text-neutral-200">{pro.catchphrase}</p> : null}
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-14 px-4 py-12">
        {/* NEWS */}
        <section className="reveal">
          <SectionTitle en="NEWS" ja="ニュース" />
          {news.length === 0 ? (
            <p className="text-sm text-(--color-dim)">ニュースはまだありません。</p>
          ) : (
            <ul className="divide-y divide-(--color-line) border-y border-(--color-line)">
              {news.map((n) => (
                <li key={n.id}>
                  <Link href={`${base}/news/${n.id}`} className="block py-4 hover:bg-(--color-panel)">
                    <div className="mb-1 flex items-center gap-3 text-xs">
                      <span className="text-(--color-dim)">{fmtDateJa(n.published_at)}</span>
                      <span className="rounded-sm border border-(--color-gold) px-2 py-0.5 text-(--color-gold)">{n.category}</span>
                    </div>
                    <p className="font-bold">{n.title}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 text-right">
            <Link href={`${base}/news`} className="sec-title text-xs text-(--color-gold) underline-offset-4 hover:underline">MORE →</Link>
          </div>
        </section>

        {/* MEDIA NEWS */}
        {media.length > 0 ? (
          <section className="reveal">
            <SectionTitle en="MEDIA" ja="メディア出演" />
            <ul className="divide-y divide-(--color-line) border-y border-(--color-line)">
              {media.map((n) => (
                <li key={n.id}>
                  <Link href={`${base}/news/${n.id}`} className="block py-4 hover:bg-(--color-panel)">
                    <div className="mb-1 flex items-center gap-3 text-xs">
                      <span className="text-(--color-dim)">{fmtDateJa(n.published_at)}</span>
                      <span className="rounded-sm border border-(--color-line) px-2 py-0.5 text-(--color-dim)">{n.category}</span>
                    </div>
                    <p className="font-bold">{n.title}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* RANKING */}
        {pro.world_ranking ? (
          <section className="reveal rounded-xl bg-(--color-ink) px-6 py-8 text-center text-white">
            <p className="sec-title mb-1 text-xs uppercase text-(--color-gold-2)">Ranking</p>
            <p className="text-3xl font-black">{pro.world_ranking}</p>
            {pro.ranking_note ? <p className="mt-2 text-xs text-neutral-400">{pro.ranking_note}</p> : null}
          </section>
        ) : null}

        {/* SCHEDULE / RESULT */}
        <section className="reveal grid gap-10 md:grid-cols-2">
          <div>
            <SectionTitle en="SCHEDULE" ja="出場予定" />
            {schedule.length === 0 ? (
              <p className="text-sm text-(--color-dim)">出場予定は未定です。</p>
            ) : (
              <ul className="space-y-3">
                {schedule.map((t) => (
                  <li key={t.id} className="rounded-lg border border-(--color-line) p-4">
                    <p className="text-xs text-(--color-dim)">{fmtSpanJa(t.start_date, t.end_date)}{t.tour ? ` ・ ${t.tour}` : ""}</p>
                    <p className="mt-1 font-bold">{t.name}</p>
                    {t.venue ? <p className="mt-1 text-xs text-(--color-dim)">{t.venue}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <SectionTitle en="RESULT" ja="成績" />
            {results.length === 0 ? (
              <p className="text-sm text-(--color-dim)">成績はまだありません。</p>
            ) : (
              <ul className="space-y-3">
                {results.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-(--color-line) p-4">
                    <div>
                      <p className="text-xs text-(--color-dim)">{fmtSpanJa(t.start_date, t.end_date)}{t.tour ? ` ・ ${t.tour}` : ""}</p>
                      <p className="mt-1 font-bold">{t.name}</p>
                    </div>
                    {t.result_rank ? (
                      <span className="shrink-0 rounded-md bg-(--color-gold) px-3 py-1.5 text-sm font-black text-white">{t.result_rank}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 text-right">
              <Link href={`${base}/schedule`} className="sec-title text-xs text-(--color-gold) underline-offset-4 hover:underline">MORE →</Link>
            </div>
          </div>
        </section>

        {/* INSTAGRAM */}
        {insta.length > 0 || pro.instagram_username ? (
          <section className="reveal">
            <SectionTitle en="INSTAGRAM" ja="インスタグラム" />
            <InstagramEmbed urls={insta.map((p) => p.post_url)} />
            {pro.instagram_username ? (
              <div className="mt-6 text-center">
                <a
                  href={`https://www.instagram.com/${pro.instagram_username}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-full border border-(--color-ink) px-6 py-2.5 text-sm font-bold hover:bg-(--color-ink) hover:text-white"
                >
                  @{pro.instagram_username} をフォローする
                </a>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* SPONSOR */}
        {sponsors.length > 0 ? (
          <section className="reveal">
            <SectionTitle en="SPONSOR" ja="スポンサー" />
            <SponsorGrid sponsors={sponsors} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
