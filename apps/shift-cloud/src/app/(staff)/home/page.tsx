import { requireActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Badge } from "@/components/ui";
import { todayJST, currentYM, hm, timeJST, fmtMinutes, yen, dowJP } from "@/lib/util";
import Link from "next/link";

export default async function HomePage() {
  const actor = await requireActor();
  const supabase = await createClient();
  const today = todayJST();
  const ym = currentYM();

  const [
    { data: todayShift },
    { data: todayRecords },
    { data: monthDays },
    { data: wage },
    { data: announcements },
    { data: events },
  ] = await Promise.all([
    supabase.from("shifts").select("*, stores(name), shift_templates(name)")
      .eq("staff_id", actor.staffId).eq("date", today).eq("status", "published").is("deleted_at", null).maybeSingle(),
    supabase.from("time_records").select("type, recorded_at")
      .eq("staff_id", actor.staffId)
      .gte("recorded_at", `${today}T00:00:00+09:00`).order("recorded_at"),
    supabase.from("attendance_days").select("work_minutes, overtime_minutes")
      .eq("staff_id", actor.staffId).gte("date", `${ym}-01`).lte("date", `${ym}-31`),
    supabase.from("staff_wages").select("hourly_wage, commute_allowance")
      .eq("staff_id", actor.staffId).is("deleted_at", null)
      .order("effective_from", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("announcements").select("id, title, body, created_at")
      .is("deleted_at", null)
      .or(`publish_from.is.null,publish_from.lte.${today}`)
      .or(`publish_to.is.null,publish_to.gte.${today}`)
      .order("created_at", { ascending: false }).limit(3),
    supabase.from("store_events").select("title, date, start_time, stores(name)")
      .in("store_id", actor.storeIds.length ? actor.storeIds : ["00000000-0000-0000-0000-000000000000"])
      .is("deleted_at", null).gte("date", today).order("date").limit(5),
  ]);

  const lastRecord = todayRecords?.[todayRecords.length - 1];
  const clockIn = todayRecords?.find((r) => r.type === "clock_in");
  const clockOut = [...(todayRecords ?? [])].reverse().find((r) => r.type === "clock_out");
  const workMin = (monthDays ?? []).reduce((s, d) => s + d.work_minutes, 0);
  const estPay = wage?.hourly_wage != null ? Math.floor((workMin / 60) * wage.hourly_wage) : null;

  const statusLabel =
    !lastRecord ? "未出勤" :
    lastRecord.type === "clock_in" || lastRecord.type === "break_end" ? "勤務中" :
    lastRecord.type === "break_start" ? "休憩中" : "退勤済み";

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">{today}（{dowJP(today)}）</p>

      <Card>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-500">今日のシフト</p>
          <Badge color={statusLabel === "勤務中" ? "green" : statusLabel === "休憩中" ? "amber" : "zinc"}>{statusLabel}</Badge>
        </div>
        {todayShift && !todayShift.is_day_off ? (
          <>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {hm(todayShift.start_time)}〜{hm(todayShift.end_time)}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {(todayShift.stores as unknown as { name: string } | null)?.name}
              {todayShift.shift_templates ? ` ・ ${(todayShift.shift_templates as unknown as { name: string }).name}` : ""}
            </p>
          </>
        ) : (
          <p className="mt-2 text-lg text-zinc-400">{todayShift?.is_day_off ? "休み" : "シフトなし"}</p>
        )}
        <div className="mt-3 flex gap-4 text-sm text-zinc-500">
          <span>出勤 {clockIn ? timeJST(clockIn.recorded_at) : "—"}</span>
          <span>退勤 {clockOut ? timeJST(clockOut.recorded_at) : "—"}</span>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <p className="text-xs font-medium text-zinc-500">今月の勤務時間</p>
          <p className="mt-1 text-xl font-semibold">{fmtMinutes(workMin)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-zinc-500">給与見込み</p>
          <p className="mt-1 text-xl font-semibold">{estPay != null ? yen(estPay) : "—"}</p>
        </Card>
      </div>

      {!!events?.length && (
        <Card>
          <p className="mb-3 text-sm font-medium text-zinc-500">店舗イベント</p>
          <ul className="space-y-2">
            {events.map((e, i) => (
              <li key={i} className="flex items-baseline gap-2 text-sm">
                <span className="whitespace-nowrap text-xs text-zinc-400">{e.date.slice(5)}（{dowJP(e.date)}）</span>
                <span className="font-medium">{e.title}</span>
                <span className="text-xs text-zinc-400">{(e.stores as unknown as { name: string } | null)?.name}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-500">お知らせ</p>
          <Link href="/notices" className="text-xs text-brand">すべて見る</Link>
        </div>
        {!announcements?.length ? (
          <p className="text-sm text-zinc-400">お知らせはありません</p>
        ) : (
          <ul className="space-y-2">
            {announcements.map((n) => (
              <li key={n.id} className="text-sm">
                <p className="font-medium">{n.title}</p>
                {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{n.body}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
