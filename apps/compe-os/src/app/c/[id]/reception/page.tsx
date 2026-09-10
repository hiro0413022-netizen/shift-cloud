import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getComp, listParticipants } from "@/lib/compe";
import { CompNav } from "@/components/nav";
import { cardCls, Empty } from "@/components/ui";
import { ReceptionTable } from "./table";

export default async function ReceptionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const comp = await getComp(actor, id);
  if (!comp) notFound();
  const participants = await listParticipants(id);

  const checkedIn = participants.filter((p) => p.checked_in).length;
  const paid = participants.filter((p) => p.paid).length;
  const pct = participants.length ? Math.round((checkedIn / participants.length) * 100) : 0;

  return (
    <>
      <CompNav compId={id} active="reception" />

      <section className={`${cardCls} mb-5`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">受付状況</h2>
          <Link
            href={`/c/${id}/print/reception`}
            target="_blank"
            className="rounded-lg border border-(--color-line) px-3 py-1.5 text-sm text-(--color-dim) hover:text-(--color-txt)"
          >
            受付表を印刷
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="参加予定" value={participants.length} tone="text-(--color-accent)" />
          <Stat label="受付済み" value={checkedIn} tone="text-emerald-600" />
          <Stat label="未受付" value={participants.length - checkedIn} tone="text-red-600" />
          <Stat label="参加費 徴収済" value={paid} tone="text-amber-600" />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-(--color-panel-2)">
            <div className="h-full rounded-full bg-(--color-accent)" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm font-bold text-(--color-accent)">{pct}%</span>
        </div>
      </section>

      <section className={cardCls}>
        {participants.length === 0 ? (
          <Empty title="参加者が登録されていません" hint="「参加者」タブから登録してください" />
        ) : (
          <ReceptionTable compId={id} participants={participants} fields={comp.reception_fields} />
        )}
      </section>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg bg-(--color-panel-2) p-4 text-center">
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs text-(--color-dim)">{label}</p>
    </div>
  );
}
