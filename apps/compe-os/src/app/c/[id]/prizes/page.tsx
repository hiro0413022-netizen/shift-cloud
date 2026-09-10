import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getComp, listPrizes } from "@/lib/compe";
import { CompNav } from "@/components/nav";
import { cardCls } from "@/components/ui";
import { PrizeEditor } from "./editor";

export default async function PrizesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const comp = await getComp(actor, id);
  if (!comp) notFound();
  const prizes = await listPrizes(id);

  return (
    <>
      <CompNav compId={id} active="prizes" />
      <div className="mb-5">
        <Link href={`/c/${id}/print/prizes`} target="_blank" className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-white">
          景品一覧を印刷
        </Link>
      </div>
      <section className={cardCls}>
        <PrizeEditor compId={id} prizes={prizes} />
      </section>
    </>
  );
}
