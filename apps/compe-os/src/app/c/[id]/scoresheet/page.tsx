import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getComp, listGroups, listParticipants, listScores } from "@/lib/compe";
import { CompNav } from "@/components/nav";
import { cardCls, Empty } from "@/components/ui";
import { HoleGrid } from "./grid";

export default async function ScoreSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const comp = await getComp(actor, id);
  if (!comp) notFound();
  const [participants, groups, scores] = await Promise.all([
    listParticipants(id),
    listGroups(id),
    listScores(id),
  ]);
  const byId = new Map(participants.map((p) => [p.id, p]));

  return (
    <>
      <CompNav compId={id} active="scoresheet" />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href={`/c/${id}/print/scoresheet`}
          target="_blank"
          className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-white"
        >
          全組のスコアシートを印刷
        </Link>
        <span className="text-xs text-(--color-dim)">既定はA3・横向き（1組が1枚に収まります）</span>
      </div>

      {groups.length === 0 ? (
        <div className={cardCls}>
          <Empty title="組み合わせが作成されていません" hint="「組み合わせ」タブで組を作ってください" />
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.id} className={cardCls}>
              <h2 className="mb-3 text-sm font-bold">
                {g.name} ／ {g.tee ?? ""} ／ {g.start_time ?? "—"}
              </h2>
              <HoleGrid
                compId={id}
                format={comp.format}
                rows={g.members
                  .map((m) => byId.get(m.participant_id))
                  .filter((p): p is NonNullable<typeof p> => Boolean(p))
                  .map((p) => ({
                    id: p.id,
                    name: p.name,
                    hcp: p.hcp,
                    holes: (scores[p.id]?.holes ?? {}) as Record<string, number>,
                  }))}
              />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
