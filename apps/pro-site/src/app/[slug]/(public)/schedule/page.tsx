import { notFound } from "next/navigation";
import { getPro, listResults, listSchedule } from "@/lib/data";
import { fmtSpanJa } from "@/lib/jst";

export const dynamic = "force-dynamic";
export const metadata = { title: "SCHEDULE / RESULT" };

export default async function SchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pro = await getPro(slug);
  if (!pro) notFound();
  const [schedule, results] = await Promise.all([listSchedule(pro.id), listResults(pro.id)]);

  return (
    <div className="mx-auto max-w-3xl space-y-12 px-4 py-10">
      <section>
        <h1 className="sec-title mb-6 text-3xl font-bold">SCHEDULE</h1>
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
      </section>

      <section>
        <h2 className="sec-title mb-6 text-3xl font-bold">RESULT</h2>
        {results.length === 0 ? (
          <p className="text-sm text-(--color-dim)">成績はまだありません。</p>
        ) : (
          <ul className="space-y-3">
            {results.map((t) => (
              <li key={t.id} className="rounded-lg border border-(--color-line) p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-(--color-dim)">{fmtSpanJa(t.start_date, t.end_date)}{t.tour ? ` ・ ${t.tour}` : ""}</p>
                    <p className="mt-1 font-bold">{t.name}</p>
                    {t.venue ? <p className="mt-1 text-xs text-(--color-dim)">{t.venue}</p> : null}
                  </div>
                  {t.result_rank ? (
                    <span className="shrink-0 rounded-md bg-(--color-gold) px-3 py-1.5 text-sm font-black text-white">{t.result_rank}</span>
                  ) : null}
                </div>
                {t.result_detail ? <p className="mt-2 text-sm text-(--color-dim)">{t.result_detail}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
