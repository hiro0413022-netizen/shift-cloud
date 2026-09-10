import { createAdmin } from "@yozan/core/supabase/admin";
import { requireCast } from "@/lib/cast";
import { businessDate, monthRange, resolveNightStore } from "@/lib/night";
import { submitShift } from "../actions";

export const dynamic = "force-dynamic";

const WD = ["日", "月", "火", "水", "木", "金", "土"];

export default async function CastShiftPage() {
  const me = await requireCast();
  const store = await resolveNightStore();
  if (!store) return <main className="p-6 text-sm">お店の設定が見つかりません。</main>;

  const admin = createAdmin();
  const today = businessDate();
  // 提出対象は「締切がまだ来ていない、いちばん近い月」
  const { data: periods } = await admin
    .from("nite_shift_periods")
    .select("id, target_month, deadline_on, status")
    .eq("store_id", store.id)
    .eq("status", "open")
    .is("deleted_at", null)
    .gte("deadline_on", today)
    .order("target_month")
    .limit(1);

  const period = (periods ?? [])[0] as
    | { id: string; target_month: string; deadline_on: string; status: string }
    | undefined;

  if (!period) {
    return (
      <main className="p-5 pt-12">
        <h1 className="mn text-lg font-bold">シフトの提出</h1>
        <p className="mt-3 text-xs text-(--color-dim)">
          いま提出できる月がありません。お店が受付を開くとここに出ます。
        </p>
      </main>
    );
  }

  const { from, to } = monthRange(period.target_month);
  const [{ data: requests }, { data: submission }] = await Promise.all([
    admin
      .from("nite_shift_requests")
      .select("work_date, wish, start_time, douhan_planned")
      .eq("cast_id", me.castId)
      .gte("work_date", from)
      .lte("work_date", to),
    admin
      .from("nite_shift_submissions")
      .select("submitted_at")
      .eq("period_id", period.id)
      .eq("cast_id", me.castId)
      .maybeSingle(),
  ]);

  const byDate = new Map(
    ((requests ?? []) as Array<{ work_date: string; wish: string; start_time: string | null; douhan_planned: boolean }>).map(
      (r) => [r.work_date, r]
    )
  );

  const dates: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  const filled = dates.filter((d) => byDate.has(d)).length;
  const daysLeft = Math.ceil(
    (new Date(`${period.deadline_on}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000
  );

  return (
    <main className="flex flex-col">
      <header className="flex items-center gap-2 border-b border-(--color-line) bg-white px-4 pb-3 pt-12">
        <h1 className="mn grow text-lg font-bold">シフトの提出</h1>
        <span className="text-[11px] text-(--color-dim)">{Number(from.slice(5, 7))}月分</span>
      </header>

      <form action={submitShift} className="flex flex-col gap-3 p-4">
        <input type="hidden" name="periodId" value={period.id} />
        <input type="hidden" name="dates" value={dates.join(",")} />

        <div className="flex gap-3 rounded-xl border border-(--color-accent-soft) bg-(--color-accent-soft) p-3.5">
          <div className="grow">
            <div className="text-[13px] font-bold text-(--color-accent)">
              {daysLeft > 0 ? `締切まで あと ${daysLeft}日` : "本日が締切です"}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-(--color-accent-2)">
              {period.deadline_on} までにお願いします。まだ {dates.length - filled}日ぶん 未入力です。
              {submission?.submitted_at && "（提出済み・締切まで直せます）"}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {dates.map((d) => {
            const cur = byDate.get(d);
            const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
            const unfilled = !cur;
            return (
              <div
                key={d}
                className={`flex items-center gap-2.5 rounded-xl border p-2.5 ${
                  unfilled ? "border-(--color-warn-soft) bg-(--color-warn-soft)" : "border-(--color-line) bg-white"
                }`}
              >
                <div className="w-9 shrink-0">
                  <div className="text-base font-bold leading-tight">{Number(d.slice(8, 10))}</div>
                  <div className={`text-[10px] ${wd === 0 ? "text-(--color-accent)" : wd === 6 ? "text-(--color-gold)" : "text-(--color-dim)"}`}>
                    {WD[wd]}
                  </div>
                </div>

                <div className="flex grow gap-1.5">
                  <label className="grow">
                    <input type="radio" name={`w_${d}`} value="work" defaultChecked={cur?.wish === "work"} className="peer sr-only" />
                    <span className="flex min-h-11 items-center justify-center rounded-lg border border-(--color-line) text-xs text-(--color-dim) peer-checked:border-(--color-txt) peer-checked:bg-(--color-txt) peer-checked:font-bold peer-checked:text-white">
                      出勤
                    </span>
                  </label>
                  <label className="grow">
                    <input type="radio" name={`w_${d}`} value="off" defaultChecked={cur?.wish === "off"} className="peer sr-only" />
                    <span className="flex min-h-11 items-center justify-center rounded-lg border border-(--color-line) text-xs text-(--color-dim) peer-checked:border-(--color-dim) peer-checked:bg-(--color-dim) peer-checked:font-bold peer-checked:text-white">
                      休み
                    </span>
                  </label>
                </div>

                <div className="w-[74px] shrink-0">
                  <input
                    name={`t_${d}`}
                    type="time"
                    defaultValue={cur?.start_time?.slice(0, 5) ?? store.openTime?.slice(0, 5) ?? "20:00"}
                    className="min-h-11 w-full rounded-lg border border-(--color-line) px-1 text-center text-[11px]"
                  />
                  <label className="mt-1 flex items-center justify-center gap-1 text-[9px] text-(--color-dim)">
                    <input type="checkbox" name={`d_${d}`} defaultChecked={cur?.douhan_planned} className="h-3 w-3" />
                    同伴
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <div className="sticky bottom-24 flex items-center gap-3 rounded-xl border border-(--color-line) bg-white p-3">
          <div>
            <div className="text-[10px] text-(--color-dim)">入力済み</div>
            <div className="text-[15px] font-bold">
              {filled} / {dates.length}日
            </div>
          </div>
          <button className="min-h-12 grow rounded-lg bg-(--color-accent) text-sm font-bold text-white">
            この内容で提出する
          </button>
        </div>
      </form>
    </main>
  );
}
