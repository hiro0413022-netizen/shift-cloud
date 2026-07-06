import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { PageTitle, Card, Badge } from "@/components/ui";
import { currentYM, addMonths, daysOfMonth, fmtDateJP } from "@/lib/util";
import { ShiftBuilder } from "./builder";
import { PeriodForm } from "./period-form";
import { closePeriod, reopenPeriod } from "./actions";

export default async function ShiftBuilderPage({ searchParams }: { searchParams: Promise<{ store?: string; ym?: string }> }) {
  const actor = await requireActor("create_shifts");
  const admin = createAdmin();
  const sp = await searchParams;
  const ym = sp.ym ?? addMonths(currentYM(), 1);
  const days = daysOfMonth(ym);

  const { data: stores } = await admin.from("stores").select("id, name")
    .eq("company_id", actor.companyId).is("deleted_at", null).order("name");
  const storeId = sp.store ?? stores?.[0]?.id;
  if (!storeId) return <PageTitle>シフト作成</PageTitle>;

  const [{ data: staffRows }, { data: templates }, { data: shifts }, { data: periods }] = await Promise.all([
    admin.from("staff").select("id, name, staff_store_assignments!inner(store_id)")
      .eq("company_id", actor.companyId).eq("status", "active").is("deleted_at", null)
      .eq("staff_store_assignments.store_id", storeId).order("name"),
    admin.from("shift_templates").select("id, name, start_time, end_time, is_day_off, color")
      .eq("company_id", actor.companyId).is("deleted_at", null).order("sort_order"),
    admin.from("shifts").select("staff_id, date, template_id, status, start_time, end_time")
      .eq("company_id", actor.companyId).eq("store_id", storeId).is("deleted_at", null)
      .gte("date", days[0]).lte("date", days[days.length - 1]),
    admin.from("shift_request_periods").select("*")
      .eq("company_id", actor.companyId).is("deleted_at", null)
      .eq("target_month", `${ym}-01`).order("start_date"),
  ]);

  // この月に紐づく全期間（前半/後半など複数可）の希望を集約
  const periodIds = (periods ?? []).map((p) => p.id);
  const { data: requests } = periodIds.length
    ? await admin.from("shift_requests").select("staff_id, date, template_id, memo, start_time, end_time")
        .in("period_id", periodIds).eq("status", "submitted").is("deleted_at", null)
    : { data: [] };

  return (
    <>
      <PageTitle>シフト作成</PageTitle>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-white px-2 py-1 shadow-sm ring-1 ring-zinc-200">
          <Link href={`/admin/shifts?store=${storeId}&ym=${addMonths(ym, -1)}`} className="rounded px-1.5 text-zinc-400 hover:bg-zinc-100">←</Link>
          <p className="font-semibold">{ym.replace("-", "年")}月</p>
          <Link href={`/admin/shifts?store=${storeId}&ym=${addMonths(ym, 1)}`} className="rounded px-1.5 text-zinc-400 hover:bg-zinc-100">→</Link>
        </div>
        <div className="flex gap-1">
          {stores?.map((s) => (
            <Link key={s.id} href={`/admin/shifts?store=${s.id}&ym=${ym}`}
              className={`rounded-md px-3 py-1.5 text-sm ${s.id === storeId ? "bg-brand-light font-medium text-brand" : "text-zinc-500 hover:bg-zinc-100"}`}>
              {s.name.replace("GOLF WING ", "")}
            </Link>
          ))}
        </div>
        <Link
          href={`/admin/shifts/print?store=${storeId}&ym=${ym}`}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          🖨 紙シフト出力
        </Link>
      </div>

      <Card className="mb-4 !p-4">
        <p className="mb-3 text-sm font-semibold">希望募集の期間</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {(periods ?? []).length === 0 && (
            <p className="text-sm text-zinc-400">まだ募集期間がありません。下から作成してください。</p>
          )}
          {(periods ?? []).map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5">
              <Badge color={p.status === "open" ? "green" : "zinc"}>
                {p.status === "open" ? "募集中" : "締切済み"}
              </Badge>
              <span className="text-xs font-medium">
                {p.title ? `${p.title}：` : ""}
                {p.start_date && p.end_date ? `${fmtDateJP(p.start_date)}〜${fmtDateJP(p.end_date)}` : p.target_month.slice(0, 7)}
              </span>
              <span className="text-[11px] text-zinc-400">締切 {p.deadline}</span>
              {p.status === "open" ? (
                <form action={closePeriod}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-100">締め切る</button>
                </form>
              ) : (
                <form action={reopenPeriod}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100">↩ 募集中に戻す</button>
                </form>
              )}
            </div>
          ))}
        </div>
        <PeriodForm ym={ym} storeId={storeId} />
      </Card>

      {!staffRows?.length ? (
        <p className="text-sm text-zinc-400">この店舗に所属スタッフがいません。スタッフ管理から追加してください。</p>
      ) : (
        <ShiftBuilder
          storeId={storeId}
          ym={ym}
          days={days}
          staff={staffRows.map((s) => ({ id: s.id, name: s.name }))}
          templates={templates ?? []}
          shifts={shifts ?? []}
          requests={requests ?? []}
        />
      )}
    </>
  );
}
