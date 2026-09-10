import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getComp, listTeams } from "@/lib/compe";
import { CompNav } from "@/components/nav";
import { cardCls } from "@/components/ui";
import { importTeamsFromGroups } from "../actions";
import { TeamEditor } from "./editor";

export default async function TeamboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const comp = await getComp(actor, id);
  if (!comp) notFound();
  const teams = await listTeams(id);

  return (
    <>
      <CompNav compId={id} active="teamboard" />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <form action={importTeamsFromGroups}>
          <input type="hidden" name="comp_id" value={id} />
          <button className="rounded-lg border border-(--color-line) bg-white px-4 py-2 text-sm">
            組み合わせから取り込む（1組＝1チーム）
          </button>
        </form>
        <Link href={`/c/${id}/print/teamboard`} target="_blank" className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-white">
          団体戦ボードを印刷
        </Link>
      </div>
      <section className={cardCls}>
        <p className="mb-4 text-xs text-(--color-dim)">
          団体戦の集計方法はコンペごとに違う（FWキープ数・上位2名の合計など）ため、スコアは人が入れる形にしています。
        </p>
        <TeamEditor compId={id} teams={teams} />
      </section>
    </>
  );
}
