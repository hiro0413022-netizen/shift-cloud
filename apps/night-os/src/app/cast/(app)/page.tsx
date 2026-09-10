import { Yen } from "@/components/ui";
import { requireCast } from "@/lib/cast";
import { createAdmin } from "@yozan/core/supabase/admin";
import { businessDate, castDaysForStore, castMonthLines, getActiveRules, resolveNightStore } from "@/lib/night";
import { requestAdvance } from "./actions";

export const dynamic = "force-dynamic";

export default async function CastHome() {
  const me = await requireCast();
  const store = await resolveNightStore();
  if (!store) return <main className="p-6 text-sm">お店の設定が見つかりません。</main>;

  const date = businessDate();
  const month = `${date.slice(0, 7)}-01`;
  const { rules } = await getActiveRules(store.id);
  const [days, monthLines] = await Promise.all([
    castDaysForStore(store.id, date, rules),
    castMonthLines(store.id, month, rules),
  ]);

  const today = days.find((d) => d.cast.id === me.castId);
  const mine = monthLines.find((l) => l.cast.id === me.castId);
  const monthGross = mine?.line.gross ?? 0;
  const available = Math.max(0, monthGross - (mine?.line.advanceTotal ?? 0));

  const admin = createAdmin();
  const { data: att } = await admin
    .from("nite_attendances")
    .select("clock_in, clock_out")
    .eq("cast_id", me.castId)
    .eq("business_date", date)
    .is("deleted_at", null)
    .maybeSingle();
  const clockIn = att?.clock_in as string | null | undefined;
  const onDuty = !!clockIn && !att?.clock_out;

  return (
    <main className="flex flex-col">
      <header className="flex items-end gap-3 border-b border-(--color-line) bg-white px-5 pb-3 pt-12">
        <div className="grow">
          <div className="text-[11px] text-(--color-dim)">おかえりなさい</div>
          <div className="mn text-xl font-bold">{me.displayName} さん</div>
        </div>
        {onDuty && clockIn && (
          <span className="rounded-full bg-(--color-ok-soft) px-3 py-1.5 text-[11px] font-bold text-(--color-ok)">
            出勤中{" "}
            {new Date(clockIn).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" })}〜
          </span>
        )}
      </header>

      <div className="flex flex-col gap-3 p-4">
        <section className="rounded-xl border border-(--color-line) bg-white p-4">
          <div className="flex items-center">
            <span className="text-xs text-(--color-dim)">今月の見込み給与</span>
            <div className="grow" />
            <span className="text-[10px] text-(--color-mute)">{date} 時点</span>
          </div>
          <div className="mn mt-1 text-[34px] font-bold leading-tight">
            <Yen value={monthGross} />
          </div>
          <div className="mt-2 flex gap-2">
            <div className="grow rounded-lg bg-(--color-bg) px-2.5 py-2">
              <div className="text-[10px] text-(--color-dim)">時給分</div>
              <div className="text-sm font-bold">
                <Yen value={mine?.line.hourlyTotal ?? 0} />
              </div>
            </div>
            <div className="grow rounded-lg bg-(--color-bg) px-2.5 py-2">
              <div className="text-[10px] text-(--color-dim)">バック分</div>
              <div className="text-sm font-bold">
                <Yen value={mine?.line.backTotal ?? 0} />
              </div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-(--color-mute)">出勤 {mine?.line.workDays ?? 0}日 ・ 締めまでの途中経過です</p>
        </section>

        {rules.advance.enabled && (
          <form action={requestAdvance} className="flex items-center gap-3 rounded-xl border border-(--color-line) bg-white p-4">
            <div className="grow">
              <div className="text-[11px] text-(--color-dim)">日払いできる残高</div>
              <div className="text-xl font-bold">
                <Yen value={available} />
              </div>
              <div className="mt-0.5 text-[10px] text-(--color-mute)">
                手数料 ¥{rules.advance.fee.toLocaleString()} ／ 当日 {rules.advance.cutoffHour}:00 まで
              </div>
            </div>
            <input
              name="amount"
              type="number"
              inputMode="numeric"
              placeholder="金額"
              max={available}
              className="min-h-12 w-24 rounded-lg border border-(--color-line) px-2 text-sm"
            />
            <button
              disabled={available <= 0}
              className="min-h-12 rounded-lg bg-(--color-txt) px-4 text-[13px] font-bold text-white disabled:opacity-40"
            >
              申請
            </button>
          </form>
        )}

        <section className="rounded-xl border border-(--color-line) bg-white p-4">
          <div className="flex items-center">
            <span className="text-xs font-bold">今日の分</span>
            <div className="grow" />
            <span className="text-[11px] text-(--color-dim)">{date}</span>
          </div>

          {!today && <p className="mt-3 text-[11px] text-(--color-mute)">まだ本日の記録がありません。</p>}

          {today && (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-(--color-accent-soft) px-3 py-2.5">
                <span className="text-[11px] text-(--color-accent-2)">今日の時給</span>
                {today.pay.hourly.applied !== today.pay.hourly.base && (
                  <span className="text-xs text-(--color-mute) line-through">¥{today.pay.hourly.base.toLocaleString()}</span>
                )}
                <span className="text-lg font-bold text-(--color-accent)">¥{today.pay.hourly.applied.toLocaleString()}</span>
                <div className="grow" />
                {today.pay.hourly.uplifts.map((u) => (
                  <span key={u.id} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-(--color-accent)">
                    {u.label}
                  </span>
                ))}
              </div>

              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {(
                  [
                    ["本指名", today.pay.metrics.nomination],
                    ["場内", today.pay.metrics.inhouse_nomination],
                    ["ドリンク", today.pay.metrics.cast_drink],
                    ["ボトル", today.pay.metrics.bottle],
                  ] as const
                ).map(([label, n]) => (
                  <div key={label} className="rounded-lg bg-(--color-bg) px-1 py-2 text-center">
                    <div className="text-lg font-bold">{n}</div>
                    <div className="text-[9px] text-(--color-dim)">{label}</div>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex flex-col">
                <Line
                  label={`時給 ¥${today.pay.hourly.applied.toLocaleString()} × ${(today.minutes / 60).toFixed(1)}h`}
                  value={today.pay.hourlyPay}
                />
                {today.pay.backs.length > 0 && <Line label="バック" value={today.pay.backTotal} />}
                {today.pay.deductions.map((d) => (
                  <Line key={d.id} label={d.label} value={-d.amount} accent />
                ))}
              </div>

              <div className="mt-2 flex items-baseline border-t border-(--color-line) pt-2.5">
                <span className="grow text-xs font-bold">今日の日当</span>
                <span className="mn text-2xl font-bold">
                  <Yen value={today.pay.net} />
                </span>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function Line({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="flex items-center border-b border-(--color-panel-2) py-1.5 last:border-b-0">
      <span className={`grow text-xs ${accent ? "text-(--color-accent)" : ""}`}>{label}</span>
      <span className={`text-[13px] font-bold ${accent ? "text-(--color-accent)" : ""}`}>
        <Yen value={value} />
      </span>
    </div>
  );
}
