import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Badge } from "@/components/ui";
import { currentYM, addMonths, daysOfMonth, dowJP, hm, todayJST } from "@/lib/util";

export default async function ShiftsPage({ searchParams }: { searchParams: Promise<{ ym?: string; view?: string }> }) {
  const actor = await requireActor();
  const supabase = await createClient();
  const sp = await searchParams;
  const ym = sp.ym ?? currentYM();
  const viewAll = sp.view === "all";
  const days = daysOfMonth(ym);
  const today = todayJST();

  const query = supabase
    .from("shifts")
    .select("staff_id, date, start_time, end_time, is_day_off, status, staff(name), stores(name), shift_templates(name, color)")
    .eq("status", "published")
    .is("deleted_at", null)
    .gte("date", days[0])
    .lte("date", days[days.length - 1])
    .order("date");

  const { data: shifts } = viewAll
    ? await query.in("store_id", actor.storeIds.length ? actor.storeIds : ["00000000-0000-0000-0000-000000000000"])
    : await query.eq("staff_id", actor.staffId);

  const byDate = new Map<string, NonNullable<typeof shifts>>();
  for (const s of shifts ?? []) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date)!.push(s);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/shifts?ym=${addMonths(ym, -1)}${viewAll ? "&view=all" : ""}`} className="text-zinc-400">←</Link>
          <p className="font-semibold">{ym.replace("-", "年")}月</p>
          <Link href={`/shifts?ym=${addMonths(ym, 1)}${viewAll ? "&view=all" : ""}`} className="text-zinc-400">→</Link>
        </div>
        <div className="flex rounded-md border border-zinc-200 text-xs">
          <Link href={`/shifts?ym=${ym}`} className={`px-3 py-1.5 ${!viewAll ? "bg-brand-light font-medium text-brand" : "text-zinc-500"}`}>自分</Link>
          <Link href={`/shifts?ym=${ym}&view=all`} className={`px-3 py-1.5 ${viewAll ? "bg-brand-light font-medium text-brand" : "text-zinc-500"}`}>全体</Link>
        </div>
      </div>

      <div className="space-y-1.5">
        {days.map((d) => {
          const dow = dowJP(d);
          const list = byDate.get(d) ?? [];
          return (
            <Card key={d} className={`!p-3 ${d === today ? "ring-1 ring-brand" : ""}`}>
              <div className="flex items-start gap-3">
                <p className={`w-14 shrink-0 pt-0.5 text-sm ${dow === "日" ? "text-red-500" : dow === "土" ? "text-blue-500" : "text-zinc-500"}`}>
                  {d.slice(8)}日（{dow}）
                </p>
                <div className="min-w-0 flex-1 space-y-1">
                  {list.length === 0 ? (
                    <p className="text-sm text-zinc-300">—</p>
                  ) : (
                    list.map((s, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        {viewAll && <span className="font-medium">{(s.staff as unknown as { name: string } | null)?.name}</span>}
                        {s.is_day_off ? (
                          <Badge color="zinc">休み</Badge>
                        ) : (
                          <>
                            <span>{hm(s.start_time)}〜{hm(s.end_time)}</span>
                            {s.shift_templates && (
                              <span className="rounded px-1.5 py-0.5 text-xs text-white" style={{ background: (s.shift_templates as unknown as { color: string }).color }}>
                                {(s.shift_templates as unknown as { name: string }).name}
                              </span>
                            )}
                            {!viewAll && <span className="text-xs text-zinc-400">{(s.stores as unknown as { name: string } | null)?.name}</span>}
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
