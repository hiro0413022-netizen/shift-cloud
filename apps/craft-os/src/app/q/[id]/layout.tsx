import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getQuote, QUOTE_STATUS_LABELS } from "@/lib/craft";
import { dateShort } from "@/lib/format";
import { Badge } from "@/components/ui";

export default async function QuoteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  const full = await getQuote(actor, Number(id));
  if (!full) notFound();
  const q = full.quote;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="no-print mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/" className="text-xs text-(--color-dim) hover:underline">
            ← 一覧へ
          </Link>
          <h1 className="mt-1 text-xl font-bold">
            {q.customer_name} 様{" "}
            <span className="ml-2 text-sm font-normal text-(--color-dim)">{q.quote_no}</span>
          </h1>
          <p className="mt-1 text-xs text-(--color-dim)">
            実施日 {dateShort(q.fitting_date ?? q.quote_date)} ／ 担当 {q.fitter_name ?? "—"} ／ {q.member_kind}
            {q.fitting_menu ? ` ／ ${q.fitting_menu}` : ""}
            {q.fitting_minutes ? `（${q.fitting_minutes}分）` : ""}
          </p>
        </div>
        <Badge tone={q.status === "draft" ? "gray" : q.status === "void" ? "danger" : "ok"}>
          {QUOTE_STATUS_LABELS[q.status] ?? q.status}
        </Badge>
      </header>
      {children}
    </main>
  );
}
