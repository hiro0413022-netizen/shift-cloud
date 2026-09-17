import { requireActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { Card, Badge } from "@/components/ui";
import { SystemLinkCards } from "@/components/system-links";
import { todayJST, currentYM, hm, timeJST, fmtMinutes, yen, dowJP } from "@/lib/util";
import { calcMonthlyPayroll, monthRange, type WageRow, type AllowanceRow } from "@/lib/payroll-calc";
import { TasksCard, type TaskItem } from "./tasks-card";
import { taskScopeFilter } from "@/lib/task-scope";
import Link from "next/link";

/** 権限（roles.permissions）で出し分ける業務システム。キーは lib/permissions.ts の PERMISSIONS と揃える */
const ROLE_LINKS: Array<{ perm: string; label: string; url: string; note: string | null }> = [
  {
    perm: "use_demo_sales",
    label: "AI DEMO SALES（HP営業）",
    url: process.env.DEMO_SALES_URL || "https://demo-sales-delta.vercel.app",
    note: "営業先リスト・デモサイト",
  },
];

export default async function HomePage() {
  const actor = await requireActor();
  const supabase = await createClient();
  const admin = createAdmin();
  const today = todayJST();
  const ym = currentYM();

  const [
    { data: todayShift },
    { data: todayRecords },
    { data: monthDays },
    { data: wages },
    { data: announcements },
    { data: events },
    { data: tasks },
    { data: links },
    { data: company },
    { data: period },
  ] = await Promise.all([
    // 下書き（未確定）も出す（#241）。確定が有ればそちらを優先（status降順で published が先）
    supabase.from("shifts").select("*, stores(name), shift_templates(name)")
      .eq("staff_id", actor.staffId).eq("date", today).in("status", ["published", "draft"]).is("deleted_at", null)
      .order("status", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("time_records").select("type, recorded_at")
      .eq("staff_id", actor.staffId)
      .gte("recorded_at", `${today}T00:00:00+09:00`).order("recorded_at"),
    supabase.from("attendance_days").select("staff_id, date, work_minutes, overtime_minutes")
      .eq("staff_id", actor.staffId).gte("date", monthRange(ym).from).lte("date", monthRange(ym).to),
    supabase.from("staff_wages").select("staff_id, hourly_wage, commute_allowance, effective_from, wage_type, monthly_salary, created_at")
      .eq("staff_id", actor.staffId).is("deleted_at", null),
    // 会社で絞る（#134）。無いとテナント跨ぎで他社のお知らせが混ざる
    supabase.from("announcements").select("id, title, body, created_at")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .or(`publish_from.is.null,publish_from.lte.${today}`)
      .or(`publish_to.is.null,publish_to.gte.${today}`)
      .order("created_at", { ascending: false }).limit(3),
    supabase.from("store_events").select("title, date, start_time, stores(name)")
      .in("store_id", actor.storeIds.length ? actor.storeIds : ["00000000-0000-0000-0000-000000000000"])
      .is("deleted_at", null).gte("date", today).order("date").limit(5),
    // 自分あて + 店舗共通（staff_id null = 予約申込など、店の誰かが対応するもの / DECISIONS #55）
    admin.from("sp_tasks").select("id, title, note, status, source, staff_id")
      .eq("company_id", actor.companyId)
      .or(taskScopeFilter(actor.staffId, actor.storeIds))
      .eq("date", today).is("deleted_at", null).order("sort"),
    admin.from("sp_links").select("id, label, url, note, store_id")
      .eq("company_id", actor.companyId).is("deleted_at", null).order("sort"),
    admin.from("companies").select("settings").eq("id", actor.companyId).single(),
    admin.from("payroll_periods").select("id").eq("company_id", actor.companyId).eq("target_month", `${ym}-01`).maybeSingle(),
  ]);

  // 今月手当（実績が入力されていれば見込みに反映）
  let allowances: AllowanceRow[] = [];
  if (period?.id) {
    const { data: alw } = await admin.from("payroll_allowances").select("staff_id, kind, amount")
      .eq("period_id", period.id).eq("staff_id", actor.staffId).is("deleted_at", null);
    allowances = (alw ?? []) as AllowanceRow[];
  }

  const lastRecord = todayRecords?.[todayRecords.length - 1];
  const clockIn = todayRecords?.find((r) => r.type === "clock_in");
  const clockOut = [...(todayRecords ?? [])].reverse().find((r) => r.type === "clock_out");
  // 給与見込み（DECISIONS #48: 本計算と同じ calcMonthlyPayroll を使う＝月給制・手当・日付按分対応）
  const settings = (company?.settings ?? {}) as { rounding_minutes?: number; overtime_rate?: number };
  const payroll = calcMonthlyPayroll(
    (monthDays ?? []) as Array<{ staff_id: string; date: string; work_minutes: number; overtime_minutes: number }>,
    (wages ?? []) as WageRow[],
    settings.rounding_minutes ?? 0,
    settings.overtime_rate ?? 1.25,
    { monthEnd: monthRange(ym).to, allowances, includeStaffIds: [actor.staffId] }
  ).get(actor.staffId);
  const estPay = payroll ? payroll.total_amount : null;
  // 表示する労働時間も給与計算と同じ「丸め後」を使う（生の合計だと給与見込みと分数が食い違う / DECISIONS #53）
  const workMin = payroll?.work ?? 0;

  // クイックリンク: 全店共通(store_id null) + 所属店舗のもの
  const storeLinks = (links ?? []).filter((l) => !l.store_id || actor.storeIds.includes(l.store_id));
  // 担当者だけが使うアプリは sp_links（会社・店舗単位でしか絞れない）に置けないので、ロールの権限で足す。
  // 例: 営業（HP制作）ロール = use_demo_sales → AI DEMO SALES。先頭に出す（その人の主業務のため）
  const perms = actor.permissions as Record<string, boolean | undefined>;
  const roleLinks = ROLE_LINKS
    .filter((l) => !perms.read_only && perms[l.perm])
    .filter((l) => !storeLinks.some((s) => s.url === l.url))
    .map(({ perm, ...l }) => ({ id: `role-${perm}`, ...l }));
  const myLinks = [...roleLinks, ...storeLinks];

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
              {todayShift.status === "draft" && (
                <span className="ml-2 align-middle rounded border border-dashed border-zinc-300 px-1 text-xs text-zinc-400">下書き</span>
              )}
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

      <TasksCard today={today} tasks={(tasks ?? []) as TaskItem[]} />

      {/* 業務システム（店舗ダッシュボードと同じカード・共通部品）。
          出すのは sp_links のうち「全店共通 + 自分の配属店舗」のもの。 */}
      {!!myLinks.length && (
        <section>
          <p className="mb-2 text-sm font-medium text-zinc-500">業務システム</p>
          <SystemLinkCards links={myLinks} gridClassName="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3" />
        </section>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <p className="text-xs font-medium text-zinc-500">今月の勤務時間</p>
          <p className="mt-1 text-xl font-semibold">{fmtMinutes(workMin)}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-zinc-500">給与見込み（概算）</p>
          <p className="mt-1 text-xl font-semibold">{estPay != null ? yen(estPay) : "—"}</p>
          <p className="mt-0.5 text-[10px] leading-tight text-zinc-400">確定額は給与明細が正</p>
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
