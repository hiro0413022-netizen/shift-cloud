import Link from "next/link";
import type { Report, ReportSection } from "@/lib/airregi-report";
import { ReportActions } from "./report-actions";

/* 文章型レポート（照合結果を人が読んで共有できる形で出す）。
   中身は lib/airregi-report.ts の buildReport。ここは見せ方だけ。 */

const TONE: Record<ReportSection["key"], string> = {
  A: "border-l-red-400",
  B: "border-l-amber-400",
  C: "border-l-blue-400",
  D: "border-l-slate-400",
  E: "border-l-violet-400",
  Z: "border-l-slate-200",
};

export function ReportView({ report, fixHref }: { report: Report; fixHref: string }) {
  return (
    <article className="space-y-5 rounded-xl border border-(--color-line) bg-white p-4 shadow-sm sm:p-6 print:border-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-bold leading-snug sm:text-xl">{report.title}</h2>
        <ReportActions text={report.text} />
      </header>

      <div className="space-y-1 rounded-lg bg-(--color-panel-2) px-4 py-3 text-sm leading-relaxed">
        {report.summary.map((line, i) => (
          <p key={i} className={i === 0 ? "font-semibold" : ""}>{line}</p>
        ))}
      </div>

      {report.sections.map((s) => (
        <section key={s.key} className={`border-l-4 pl-3 sm:pl-4 ${TONE[s.key]}`}>
          <h3 className="mb-2 text-base font-bold">
            {s.key !== "Z" && <span className="mr-1">{s.key}.</span>}
            {s.title}
          </h3>

          {s.columns && s.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-(--color-line) text-left text-xs text-(--color-dim)">
                    {s.columns.map((c, i) => (
                      <th key={c} className={`px-2 py-1.5 font-medium ${i === 2 ? "text-right" : ""}`}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r, ri) => (
                    <tr key={ri} className="border-b border-(--color-line)/60 align-top">
                      {r.cells.map((c, i) => (
                        <td key={i} className={`px-2 py-1.5 ${i === 0 ? "whitespace-nowrap tabular-nums text-(--color-dim)" : ""} ${i === 2 ? "whitespace-nowrap text-right font-semibold tabular-nums" : ""}`}>
                          {c}
                          {i === 1 && r.note && <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">{r.note}</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {s.bullets && s.bullets.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
              {s.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}

          {s.notes.map((n, i) => (
            <p key={i} className="mt-2 text-sm font-medium text-(--color-txt)">→ {n}</p>
          ))}
        </section>
      ))}

      {!report.ok && (
        <p className="border-t border-(--color-line) pt-3 text-sm text-(--color-dim) print:hidden">
          直すときは <Link href={fixHref} className="font-semibold text-(--color-gold) underline">「確認して直す」</Link> から。直した分はこのレポートからも消えます。
        </p>
      )}
    </article>
  );
}
