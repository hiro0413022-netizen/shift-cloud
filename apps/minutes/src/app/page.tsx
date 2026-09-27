import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { listMeetings } from "@/lib/meetings";
import { MODE_BY_ID, isModeId } from "@/lib/modes";
import { STATUS_LABEL } from "@/lib/labels";
import { LevelBadge, Pill, btnCls, cardCls } from "@/components/ui";
import { Header } from "@/components/header";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const actor = await requireActor();
  const meetings = await listMeetings(actor);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Header name={actor.name} />

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">議事録</h2>
        <Link href="/new" className={btnCls}>
          ＋ 新しい議事録
        </Link>
      </div>

      {meetings.length === 0 ? (
        <section className={cardCls}>
          <p className="text-sm text-(--color-dim)">
            まだ議事録がありません。「新しい議事録」から、会議を録音するか、音声ファイルや文字起こしを取り込んでください。
          </p>
        </section>
      ) : (
        <ul className="divide-y divide-(--color-line) overflow-hidden rounded-xl border border-(--color-line) bg-(--color-panel)">
          {meetings.map((m) => {
            const st = STATUS_LABEL[m.status] ?? STATUS_LABEL.draft;
            const mode = isModeId(m.mode) ? MODE_BY_ID[m.mode].label : "種類はAIが判定";
            return (
              <li key={m.id}>
                <Link href={`/m/${m.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-(--color-panel-2)">
                  <span className="w-24 shrink-0 text-sm tabular-nums text-(--color-dim)">{m.meetingDate}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <LevelBadge level={m.level} />
                    <Pill>{mode}</Pill>
                    <Pill tone={st.tone}>{st.text}</Pill>
                    {m.creatorName && <span className="text-xs text-(--color-dim)">{m.creatorName}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-xs leading-relaxed text-(--color-dim)">
        L2（社外秘）の議事録は、作成した人とオーナーにしか表示されません。確定から30日で文字起こしは自動で消えます（確定した本文は残ります）。
      </p>
    </main>
  );
}
