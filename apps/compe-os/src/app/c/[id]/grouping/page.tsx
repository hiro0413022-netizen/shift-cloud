import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getComp, listGroups, listParticipants } from "@/lib/compe";
import { CompNav } from "@/components/nav";
import { cardCls } from "@/components/ui";
import { GroupingBoard } from "./board";
import { addGroup, autoGroup, clearGroups } from "../actions";

export default async function GroupingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const comp = await getComp(actor, id);
  if (!comp) notFound();
  const [participants, groups] = await Promise.all([listParticipants(id), listGroups(id)]);

  return (
    <>
      <CompNav compId={id} active="grouping" />

      <section className={`${cardCls} mb-5`}>
        <div className="flex flex-wrap items-center gap-2">
          <form action={autoGroup}>
            <input type="hidden" name="comp_id" value={id} />
            <button className="rounded-lg bg-(--color-accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--color-accent-2)">
              HCP順で自動割り振り
            </button>
          </form>
          <form action={addGroup}>
            <input type="hidden" name="comp_id" value={id} />
            <button className="rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm">組を追加</button>
          </form>
          <form action={clearGroups}>
            <input type="hidden" name="comp_id" value={id} />
            <button className="rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm text-(--color-dim)">
              組をすべて消す
            </button>
          </form>
          <Link
            href={`/c/${id}/announcement`}
            className="ml-auto rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm"
          >
            案内文を作る
          </Link>
        </div>
        <p className="mt-3 text-xs text-(--color-dim)">
          自動割り振りは、HCPの上手い順に蛇行させて各組の力量が偏らないように配ります。
          <strong className="text-(--color-warn)">押すと今の組み合わせは消えます。</strong>
          手で直したあとは押さないでください。
        </p>
      </section>

      <GroupingBoard compId={id} participants={participants} groups={groups} teeOptions={comp.tee_options} />
    </>
  );
}
