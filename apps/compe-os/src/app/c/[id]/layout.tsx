import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getComp } from "@/lib/compe";
import { dateShort } from "@/lib/format";

export default async function CompLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireActor();
  const comp = await getComp(actor, id);
  if (!comp) notFound();

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/" className="text-xs text-(--color-dim) hover:underline">
            ← コンペ一覧
          </Link>
          <h1 className="text-xl font-bold">{comp.name}</h1>
          <p className="text-xs text-(--color-dim)">
            {dateShort(comp.held_on)} ／ {comp.venue || "会場未定"}
          </p>
        </div>
        <form action="/api/logout" method="post">
          <button className="text-sm text-(--color-dim) hover:text-(--color-txt)">{actor.name} — ログアウト</button>
        </form>
      </header>
      {children}
    </div>
  );
}
