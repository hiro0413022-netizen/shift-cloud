import Link from "next/link";
import { loadDay, occupancy, lessonOccupancy, type BookingRow, type DayView } from "@/lib/frank-reservation";
import { toMin, jstToday } from "@yozan/core/frank-booking";

/**
 * FRANK GOLF 姫路 予約カレンダー（店舗ダッシュボード・#129）
 * - 日/週の切替、打席×時間帯で誰が入っているかを表示（体験/会員/都度/レッスン）
 * - 会員に重要説明事項（alert_note）があると ⚠ を付ける
 * - iPad想定: 横スクロール可・タップしやすい高さ
 */

// 正午JST(=同日03:00Z)を基準にするとUTC変換で日付がズレない（JST日付ルール #73）
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const DOW = ["日", "月", "火", "水", "木", "金", "土"];
function labelJa(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00+09:00`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${DOW[d.getUTCDay()]}）`;
}

function who(b: BookingRow): string {
  if (b.frunk_members) return b.frunk_members.name;
  if (b.mbr_trial_requests) return b.mbr_trial_requests.name;
  return b.guest_name ?? "ご予約";
}
function hasAlert(b: BookingRow): boolean {
  return !!b.frunk_members?.alert_note?.trim();
}
function toneOf(b: BookingRow): string {
  return b.customer_kind === "trial"
    ? "bg-amber-100 text-amber-900 border-amber-300"
    : b.customer_kind === "member"
      ? "bg-sky-100 text-sky-900 border-sky-300"
      : "bg-emerald-100 text-emerald-900 border-emerald-300";
}

const LESSON_OS_URL = process.env.NEXT_PUBLIC_LESSON_OS_URL || "https://lesson-os.vercel.app";

export async function FrankCalendarDashboard({
  date,
  view,
  companyId,
  extraQuery = "",
}: {
  date: string;
  view: "day" | "week";
  companyId: string; // 会社＋FRANK店舗で必ず絞るため（#134）
  extraQuery?: string; // オーナーの店舗切替(?store=frank)を維持するため
}) {
  const today = jstToday();
  const days = view === "day" ? [date] : Array.from({ length: 7 }, (_, i) => addDays(date, i));
  const views: DayView[] = await Promise.all(days.map((d) => loadDay(d, companyId)));

  const step = view === "day" ? 1 : 7;
  const href = (d: string, v: string) => `/dashboard?date=${d}&view=${v}${extraQuery}`;

  const btn =
    "rounded-lg border border-(--color-line) bg-white px-3 py-2 text-sm text-(--color-dim) hover:text-(--color-txt)";
  const btnActive = "rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white";

  return (
    <div className="space-y-4">
      <header className="reveal flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">予約カレンダー</h1>
          <p className="mt-0.5 text-sm text-(--color-dim)">FRANK GOLF 姫路 ・ 体験/会員/レッスンの予約状況</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href(addDays(date, -step), view)} className={btn} aria-label="前へ">←</Link>
          <form className="flex items-center gap-2">
            <input type="hidden" name="view" value={view} />
            {extraQuery.includes("store=frank") && <input type="hidden" name="store" value="frank" />}
            <input type="date" name="date" defaultValue={date} className="rounded-lg border border-(--color-line) bg-white px-3 py-1.5 text-sm" />
            <button className={btn}>表示</button>
          </form>
          <Link href={href(addDays(date, step), view)} className={btn} aria-label="次へ">→</Link>
          <Link href={href(today, view)} className={btn}>今日</Link>
          <span className="mx-1 h-6 w-px bg-(--color-line)" />
          <Link href={href(date, "day")} className={view === "day" ? btnActive : btn}>日</Link>
          <Link href={href(date, "week")} className={view === "week" ? btnActive : btn}>週</Link>
        </div>
      </header>

      <div className="reveal flex flex-wrap gap-2 text-xs">
        <a href={`${LESSON_OS_URL}/frank`} target="_blank" rel="noreferrer" className={btn}>🎯 レッスン管理システム ↗</a>
        <Link href={`/reservations?date=${date}`} className={btn}>予約の登録・入金（予約管理）</Link>
        <Link href="/frunk" className={btn}>FRANK会員（重要説明事項の記入）</Link>
        <Link href="/board" target="_blank" className={btn}>ロビー掲示用カレンダー ↗</Link>
      </div>

      {view === "day" ? <DayGrid view0={views[0]} isToday={date === today} /> : <WeekGrid views={views} today={today} />}

      <div className="flex flex-wrap items-center gap-4 text-xs text-(--color-dim)">
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-sky-400" />会員</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-amber-400" />体験</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-emerald-400" />都度利用</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded bg-violet-400" />レッスン枠</span>
        <span>⚠ = 重要説明事項あり（FRANK会員画面で記入・確認）</span>
      </div>
    </div>
  );
}

function DayGrid({ view0, isToday }: { view0: DayView; isToday: boolean }) {
  if (view0.closed) {
    return (
      <div className="reveal rounded-2xl border border-(--color-line) bg-(--color-panel) p-10 text-center text-lg text-(--color-dim)">
        {labelJa(view0.date)} は定休日です
      </div>
    );
  }
  const bays = view0.bays.filter((b) => b.active);
  const cells = occupancy(view0);
  const lessonCells = lessonOccupancy(view0);
  const now = new Date(Date.now() + 9 * 3600_000);
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const step = view0.cfg.slot_minutes;

  return (
    <div className="reveal overflow-x-auto rounded-2xl border border-(--color-line) bg-(--color-panel) p-3">
      <table className="w-full border-collapse text-center">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-(--color-panel) p-2 text-left text-xs text-(--color-dim)">打席</th>
            {view0.slots.map((s) => {
              const isNow = isToday && toMin(s) <= nowMin && nowMin < toMin(s) + step;
              return (
                <th key={s} className={`min-w-16 p-1.5 text-xs font-semibold ${isNow ? "text-accent" : "text-(--color-dim)"}`}>{s}</th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {bays.map((r) => (
            <tr key={r.id} className="border-t border-(--color-line)">
              <td className="sticky left-0 z-10 bg-(--color-panel) p-2 text-left text-sm font-bold whitespace-nowrap">{r.name}</td>
              {view0.slots.map((s) => {
                const b = cells.get(`${r.id}|${s}`);
                const l = lessonCells.get(`${r.id}|${s}`);
                if (!b && !l) return <td key={s} className="p-1 text-(--color-line)">―</td>;
                if (!b && l) {
                  return (
                    <td key={s} className="p-1">
                      <div className="rounded-md border border-violet-300 bg-violet-100 px-1 py-1.5 text-xs font-semibold text-violet-900">レッスン</div>
                    </td>
                  );
                }
                const bk = b as BookingRow;
                return (
                  <td key={s} className="p-1">
                    <div className={`rounded-md border px-1 py-1.5 text-xs font-semibold leading-tight ${toneOf(bk)}`}>
                      {hasAlert(bk) ? <span title={bk.frunk_members?.alert_note ?? ""}>⚠</span> : null}
                      {who(bk)}
                      {bk.party_size && bk.party_size > 1 ? <span className="ml-0.5 opacity-70">{bk.party_size}名</span> : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WeekGrid({ views, today }: { views: DayView[]; today: string }) {
  // 週表示: 行=日付 × 列=打席。セルには「開始時刻 名前」を時系列で並べる
  const bays = views[0].bays.filter((b) => b.active);
  return (
    <div className="reveal overflow-x-auto rounded-2xl border border-(--color-line) bg-(--color-panel) p-3">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="p-2 text-left text-xs text-(--color-dim)">日付</th>
            {bays.map((b) => (
              <th key={b.id} className="min-w-40 p-2 text-xs font-semibold text-(--color-dim)">{b.name}</th>
            ))}
            <th className="min-w-32 p-2 text-xs font-semibold text-violet-600">レッスン枠</th>
          </tr>
        </thead>
        <tbody>
          {views.map((v) => {
            const live = v.bookings.filter((b) => b.status !== "cancelled");
            return (
              <tr key={v.date} className={`border-t border-(--color-line) align-top ${v.date === today ? "bg-accent/5" : ""}`}>
                <td className="whitespace-nowrap p-2 text-sm font-bold">
                  <Link href={`/dashboard?date=${v.date}&view=day`} className="hover:text-accent">{labelJa(v.date)}</Link>
                  {v.date === today && <span className="ml-1 rounded bg-accent px-1 text-[10px] font-bold text-white">今日</span>}
                </td>
                {v.closed ? (
                  <td colSpan={bays.length + 1} className="p-2 text-sm text-(--color-dim)">定休日</td>
                ) : (
                  <>
                    {bays.map((bay) => {
                      const list = live
                        .filter((b) => b.bay_id === bay.id)
                        .sort((a, b) => a.start_time.localeCompare(b.start_time));
                      return (
                        <td key={bay.id} className="p-1.5">
                          {list.length === 0 ? (
                            <span className="text-xs text-(--color-line)">―</span>
                          ) : (
                            <div className="space-y-1">
                              {list.map((b) => (
                                <div key={b.id} className={`rounded-md border px-1.5 py-1 text-xs font-medium leading-tight ${toneOf(b)}`}>
                                  {b.start_time.slice(0, 5)} {hasAlert(b) ? <span title={b.frunk_members?.alert_note ?? ""}>⚠</span> : null}
                                  {who(b)}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-1.5">
                      {v.lessons.length === 0 ? (
                        <span className="text-xs text-(--color-line)">―</span>
                      ) : (
                        <div className="space-y-1">
                          {v.lessons.map((l) => (
                            <div key={l.id} className="rounded-md border border-violet-300 bg-violet-100 px-1.5 py-1 text-xs font-medium text-violet-900">
                              {l.start_time.slice(0, 5)} {l.staff?.name ?? "レッスン"}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
