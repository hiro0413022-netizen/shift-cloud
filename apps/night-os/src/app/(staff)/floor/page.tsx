import Link from "next/link";
import { createAdmin } from "@yozan/core/supabase/admin";
import { Chip, Avatar, Yen } from "@/components/ui";
import { businessDate, castDaysForStore, daySummary, getActiveRules, listCasts, listFloor, resolveNightStore } from "@/lib/night";
import { NewGuest } from "./new-guest";
import { AttendancePanel } from "./attendance";

export const dynamic = "force-dynamic";

function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export default async function FloorPage() {
  const store = await resolveNightStore();
  if (!store) {
    return <main className="p-6 text-sm text-(--color-dim)">店舗（code: night-himeji）が登録されていません。</main>;
  }
  const date = businessDate();
  const { rules } = await getActiveRules(store.id);
  const [tables, summary, casts, days] = await Promise.all([
    listFloor(store.id, rules, date),
    daySummary(store.id, date, rules),
    listCasts(store.id),
    castDaysForStore(store.id, date, rules),
  ]);

  const admin = createAdmin();
  const { data: atts } = await admin
    .from("nite_attendances")
    .select("cast_id, minutes, clock_in, clock_out")
    .eq("store_id", store.id)
    .eq("business_date", date)
    .is("deleted_at", null);
  const attMap = new Map(
    ((atts ?? []) as Array<{ cast_id: string; minutes: number; clock_in: string | null; clock_out: string | null }>).map((a) => [
      a.cast_id,
      a,
    ])
  );

  const emptyTables = tables.filter((t) => !t.slip).map((t) => ({ id: t.id, code: t.code, seats: t.seats }));
  const onDuty = days.filter((d) => d.minutes > 0 || attMap.get(d.cast.id)?.clock_in);

  return (
    <main className="flex min-h-[calc(100vh-57px)] flex-col">
      <div className="flex grow flex-col lg:flex-row">
        {/* 卓 */}
        <section className="grow p-4">
          <div className="mb-3 flex items-center gap-3">
            <h1 className="text-sm font-bold">フロア</h1>
            <span className="text-[11px] text-(--color-dim)">卓をタップすると伝票が開きます</span>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {tables.map((t) => {
              if (!t.slip) {
                return (
                  <div
                    key={t.id}
                    className="flex min-h-[168px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-(--color-line) bg-white/60"
                  >
                    <div className="text-sm font-medium text-(--color-dim)">{t.code} ・ 空席</div>
                    <div className="text-[11px] text-(--color-mute)">{t.seats}名まで</div>
                  </div>
                );
              }
              const elapsed = minutesSince(t.slip.openedAt);
              const remain = t.slip.setMinutes - elapsed;
              const ratio = Math.min(100, Math.round((elapsed / t.slip.setMinutes) * 100));
              const tone = remain <= 5 ? "warn" : "ok";
              const border = remain <= 5 ? "var(--color-warn)" : "var(--color-ok)";
              return (
                <Link
                  href={`/slips/${t.slip.id}`}
                  key={t.id}
                  className="flex min-h-[168px] flex-col gap-2 rounded-xl border border-(--color-line) bg-white p-3"
                  style={{ borderTop: `3px solid ${border}` }}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="mn text-xl font-bold">{t.code}</span>
                    <Chip tone={tone}>{remain <= 5 ? "延長確認" : "在席"}</Chip>
                    <div className="grow" />
                    <span className="text-[11px] text-(--color-dim)">{t.slip.guests}名</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[22px] font-bold">{elapsed}</span>
                    <span className="text-[11px] text-(--color-dim)">
                      分経過 ・ 残 {Math.max(0, remain)}分
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded bg-(--color-panel-2)">
                    <div className="h-full" style={{ width: `${ratio}%`, background: border }} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {t.slip.broughtByName && (
                      <Chip tone="ok">{t.slip.broughtKind === "douhan" ? "同伴" : "紹介"} {t.slip.broughtByName}</Chip>
                    )}
                    {[...new Set(t.slip.items.filter((i) => i.status === "active" && i.castName).map((i) => i.castName!))]
                      .slice(0, 3)
                      .map((n) => (
                        <Chip key={n} tone="accent">
                          {n}
                        </Chip>
                      ))}
                    {t.slip.missingCastCount > 0 && <Chip tone="warn">担当未入力 {t.slip.missingCastCount}</Chip>}
                  </div>
                  <div className="grow" />
                  <div className="flex items-baseline justify-between border-t border-(--color-panel-2) pt-2">
                    <span className="text-[10px] text-(--color-dim)">現在の伝票</span>
                    <span className="text-[17px] font-bold">
                      <Yen value={t.slip.totals.total} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* 右レール */}
        <aside className="w-full shrink-0 border-t border-(--color-line) bg-white p-4 lg:w-[300px] lg:border-l lg:border-t-0">
          <div className="text-[11px] text-(--color-dim)">本日の売上（速報）</div>
          <div className="mn text-[30px] font-bold leading-none">
            <Yen value={summary.sales} />
          </div>
          <div className="mt-2 flex gap-4">
            <div>
              <div className="text-[10px] text-(--color-dim)">組数</div>
              <div className="text-sm font-bold">{summary.groups}</div>
            </div>
            <div>
              <div className="text-[10px] text-(--color-dim)">組単価</div>
              <div className="text-sm font-bold">
                <Yen value={summary.perGroup} />
              </div>
            </div>
            <div>
              <div className="text-[10px] text-(--color-dim)">在店</div>
              <div className="text-sm font-bold">{summary.openTables}卓</div>
            </div>
          </div>

          {summary.missingCastSlips > 0 && (
            <div className="mt-3 rounded-lg border border-(--color-accent-soft) bg-(--color-accent-soft) p-3">
              <div className="text-xs font-bold text-(--color-accent)">
                担当が入っていない伝票 {summary.missingCastSlips}件
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-(--color-accent-2)">
                このままではお会計に進めません。伝票を開いて担当を選んでください。
              </p>
            </div>
          )}

          <div className="mt-4 border-t border-(--color-panel-2) pt-3">
            <div className="mb-2 flex items-center">
              <span className="text-[11px] font-bold">出勤キャスト</span>
              <div className="grow" />
              <span className="text-[10px] text-(--color-dim)">本 / 場 / ドリンク</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {onDuty.length === 0 && <p className="text-[11px] text-(--color-mute)">まだ出勤の打刻がありません。</p>}
              {onDuty.map((d, i) => (
                <div key={d.cast.id} className="flex items-center gap-2 rounded-lg bg-(--color-bg) px-2 py-1.5">
                  <Avatar name={d.cast.displayName} tone={i} />
                  <span className="grow text-xs font-medium">{d.cast.name}</span>
                  <span className="text-xs text-(--color-dim)">
                    {d.pay.metrics.nomination} / {d.pay.metrics.inhouse_nomination} / {d.pay.metrics.cast_drink}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* 下部バー */}
      <div className="sticky bottom-0 flex items-center gap-2 border-t border-(--color-line) bg-white px-4 py-3">
        <NewGuest tables={emptyTables} casts={casts.map((c) => ({ id: c.id, displayName: c.displayName }))} />
        <AttendancePanel
          rows={casts.map((c) => {
            const a = attMap.get(c.id);
            return {
              id: c.id,
              displayName: c.displayName,
              hourlyWage: c.hourlyWage,
              minutes: a?.minutes ?? 0,
              onDuty: !!a?.clock_in && !a?.clock_out,
            };
          })}
        />
        <div className="grow" />
        <Link href="/owner" className="min-h-11 rounded-lg bg-(--color-accent) px-6 text-sm font-bold leading-[44px] text-white">
          本日の集計
        </Link>
      </div>
    </main>
  );
}
