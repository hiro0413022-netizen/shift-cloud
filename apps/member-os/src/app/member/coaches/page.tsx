import Link from "next/link";
import { requireMember, resolveHimeji } from "@/lib/member";
import { loadCoachShifts } from "@/lib/frank-coach-shifts";

export const dynamic = "force-dynamic";

/**
 * コーチ・スタッフの出勤予定（#209）
 *
 * 会員が知りたいのは「その日に誰がいるか」。名簿ではないので、
 * **いない日は空にして、いる人だけ**を並べる。予定が変わりうることは必ず添える。
 */
export default async function MemberCoachesPage() {
  const member = await requireMember();
  const store = await resolveHimeji();
  const days = await loadCoachShifts(14);
  const hasAny = days.some((d) => d.people.length > 0);

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 py-8">
      <header className="mb-5">
        <Link href="/member" className="text-xs text-(--color-dim) underline underline-offset-4">← マイページ</Link>
        <h1 className="mt-2 text-xl font-bold tracking-wide">コーチの出勤予定</h1>
        <p className="text-xs text-(--color-dim)">{store?.name ?? "FRANK GOLF 姫路"}　これから2週間</p>
      </header>

      {!hasAny ? (
        <p className="rounded-xl border border-(--color-line) bg-(--color-panel) px-4 py-8 text-center text-sm text-(--color-dim)">
          出勤予定はまだ確定していません。決まりしだいこの画面に出ます。
        </p>
      ) : (
        <ul className="space-y-2">
          {days.map((d) => (
            <li
              key={d.date}
              className={`rounded-xl border px-4 py-3 ${
                d.isToday ? "border-(--color-gold)/50 bg-(--color-panel)" : "border-(--color-line) bg-(--color-panel)"
              } ${d.closed ? "opacity-60" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-semibold">
                  {d.label}
                  {d.isToday && <span className="ml-2 rounded-full bg-(--color-gold) px-2 py-0.5 text-[11px] font-bold text-white">本日</span>}
                </p>
                {d.people.length === 0 && (
                  <span className="text-xs text-(--color-dim)">{d.closed ? "定休日" : "未定"}</span>
                )}
              </div>
              {d.people.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {d.people.map((p, i) => (
                    <li key={`${d.date}-${i}`} className="flex items-center justify-between gap-3 text-sm">
                      <span>
                        {p.name}
                        <span className="ml-1.5 text-[11px] text-(--color-dim)">{p.role}</span>
                      </span>
                      <span className="tabular-nums text-(--color-dim)">{p.time}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 rounded-xl border border-(--color-line) bg-(--color-panel) px-4 py-3 text-[11px] leading-relaxed text-(--color-dim)">
        予定は変更になる場合があります。パーソナルレッスンをご希望のときは、打席のご予約のときに「パーソナルレッスンを追加」をお選びください。
      </p>
    </main>
  );
}
