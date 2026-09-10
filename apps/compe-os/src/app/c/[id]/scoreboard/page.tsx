import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getComp, listParticipants, listScores } from "@/lib/compe";
import { CompNav } from "@/components/nav";
import { cardCls, Empty } from "@/components/ui";
import { isPeria } from "@yozan/core/compe-score";
import { GrossEntry } from "./entry";

export default async function ScoreboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const comp = await getComp(actor, id);
  if (!comp) notFound();
  const [participants, scores] = await Promise.all([listParticipants(id), listScores(id)]);

  return (
    <>
      <CompNav compId={id} active="scoreboard" />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={`/c/${id}/print/board`} target="_blank" className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-white">
          表彰ボードを印刷
        </Link>
        <Link href={`/c/${id}/print/sheet`} target="_blank" className="rounded-lg border border-(--color-line) bg-white px-4 py-2 text-sm">
          手書きシートを印刷
        </Link>
        <Link href={`/c/${id}/scoresheet`} className="rounded-lg border border-(--color-line) bg-white px-4 py-2 text-sm">
          ホール別に入力する
        </Link>
      </div>

      {isPeria(comp.format) && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          この競技はペリア方式です。HCPは隠しホールのスコアから自動計算されるため、
          <strong>GROSSだけを入れても順位は出ません</strong>。「ホール別に入力する」からホールごとのスコアを入れてください。
        </p>
      )}

      <section className={cardCls}>
        {participants.length === 0 ? (
          <Empty title="参加者が登録されていません" />
        ) : (
          <GrossEntry
            compId={id}
            format={comp.format}
            participants={participants.map((p) => ({ id: p.id, name: p.name, hcp: p.hcp, org: p.org }))}
            scores={scores}
          />
        )}
      </section>
    </>
  );
}
