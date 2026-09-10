import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { getComp, listGroups, listParticipants, listScores } from "@/lib/compe";
import { dateJa, yen } from "@/lib/format";
import { CompNav } from "@/components/nav";
import { cardCls } from "@/components/ui";
import { buildScoreRows, formatLabel } from "@yozan/core/compe-score";
import { notFound } from "next/navigation";

export default async function CompDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  const comp = await getComp(actor, id);
  if (!comp) notFound();

  const [participants, groups, scores] = await Promise.all([
    listParticipants(id),
    listGroups(id),
    listScores(id),
  ]);
  const checkedIn = participants.filter((p) => p.checked_in).length;
  const paid = participants.filter((p) => p.paid).length;
  const { ranked } = buildScoreRows(
    participants.map((p) => ({ id: p.id, name: p.name, hcp: p.hcp })),
    scores,
    comp.format
  );
  const assigned = new Set(groups.flatMap((g) => g.members.map((m) => m.participant_id)));
  const unassigned = participants.filter((p) => !assigned.has(p.id)).length;

  const stats = [
    { label: "参加者", value: `${participants.length}`, unit: "名" },
    { label: "受付済み", value: `${checkedIn}`, unit: `/ ${participants.length} 名` },
    { label: "参加費 徴収済", value: `${paid}`, unit: `/ ${participants.length} 名` },
    { label: "組数", value: `${groups.length}`, unit: "組" },
    { label: "スコア入力済", value: `${ranked.length}`, unit: `/ ${participants.length} 名` },
  ];

  const pct = participants.length ? Math.round((checkedIn / participants.length) * 100) : 0;

  return (
    <>
      <CompNav compId={id} active="" />

      <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
            <p className="text-xs text-(--color-dim)">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-(--color-accent)">
              {s.value}
              <span className="ml-1 text-xs font-normal text-(--color-dim)">{s.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {unassigned > 0 && groups.length > 0 && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          組に入っていない参加者が {unassigned} 名います。
          <Link href={`/c/${id}/grouping`} className="ml-2 underline">
            組み合わせを確認する
          </Link>
        </div>
      )}

      <section className={`${cardCls} mb-5`}>
        <h2 className="mb-3 text-sm font-bold">コンペ情報</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <Item label="開催日" value={dateJa(comp.held_on)} />
          <Item label="会場" value={comp.venue || "—"} />
          <Item label="コース" value={comp.course || "—"} />
          <Item label="競技形式" value={formatLabel(comp.format)} />
          <Item label="参加費" value={yen(comp.fee)} />
          <Item label="集合／スタート" value={`${comp.meet_time || "—"} ／ ${comp.start_time || "—"}`} />
        </dl>
      </section>

      <section className={`${cardCls} mb-5`}>
        <h2 className="mb-2 text-sm font-bold">受付状況</h2>
        <p className="mb-2 text-xs text-(--color-dim)">
          受付済み {checkedIn}名 / {participants.length}名
        </p>
        <div className="flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-(--color-panel-2)">
            <div className="h-full rounded-full bg-(--color-accent)" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm font-bold text-(--color-accent)">{pct}%</span>
        </div>
      </section>

      <section className={cardCls}>
        <h2 className="mb-3 text-sm font-bold">よく使う画面</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["participants", "参加者登録"],
            ["reception", "当日の受付"],
            ["grouping", "組み合わせ"],
            ["announcement", "案内文を印刷"],
            ["scoresheet", "スコアシート"],
            ["scoreboard", "個人戦ボード"],
            ["teamboard", "団体戦ボード"],
            ["prizes", "景品一覧"],
          ].map(([seg, label]) => (
            <Link
              key={seg}
              href={`/c/${id}/${seg}`}
              className="rounded-lg border border-(--color-line) px-3 py-3 text-center text-sm hover:border-(--color-accent) hover:bg-(--color-panel-2)"
            >
              {label}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-(--color-dim)">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
