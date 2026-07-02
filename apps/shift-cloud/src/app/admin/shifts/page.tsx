import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { PageTitle, Card, Button, Input, Label, Badge } from "@/components/ui";
import { currentYM, addMonths, daysOfMonth } from "@/lib/util";
import { ShiftBuilder } from "./builder";
import { openPeriod, closePeriod } from "./actions";

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
    admin.from("shifts").select("staff_id, date, template_id, status")
      .eq("company_id", actor.companyId).eq("store_id", storeId).is("deleted_at", null)
      .gte("date", days[0]).lte("date", days[days.length - 1]),
    admin.from("shift_request_periods").select("*")
      .eq("company_id", actor.companyId).is("deleted_at", null)
      .order("target_month", { ascending: false }).limit(6),
  ]);

  const period = (periods ?? []).find((p) => p.target_month.slice(0, 7) === ym);
  const { data: requests } = period
    ? await admin.from("shift_requests").select("staff_id, date, template_id, memo")
        .eq("period_id", period.id).eq("status", "submitted").is("deleted_at", null)
    : { data: [] };

  return (
    <>
      <PageTitle>シフト作成</PageTitle>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/admin/shifts?store=${storeId}&ym=${addMonths(ym, -1)}`} className="text-zinc-400">←</Link>
          <p className="font-semibold">{ym.replace("-", "年")}月</p>
          <Link href={`/admin/shifts?store=${storeId}&ym=${addMonths(ym, 1)}`} className="text-zinc-400">→</Link>
        </div>
        <div className="flex gap-1">
          {stores?.map((s) => (
            <Link key={s.id} href={`/admin/shifts?store=${s.id}&ym=${ym}`}
              className={`rounded-md px-3 py-1.5 text-sm ${s.id === storeId ? "bg-brand-light font-medium text-brand" : "text-zinc-500 hover:bg-zinc-100"}`}>
              {s.name.replace("GOLF WING ", "")}
            </Link>
          ))}
        </div>
      </div>

      <Card className="mb-4 !p-4">
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm font-medium">希望募集:</p>
          {period ? (
            <>
              <Badge color={period.status === "open" ? "green" : "zinc"}>
                {period.status === "open" ? `募集中（締切 ${period.deadline}）` : "締切済み"}
              </Badge>
              {period.status === "open" && (
                <form action={closePeriod}>
                  <input type="hidden" name="id" value={period.id} />
                  <Button variant="secondary" type="submit">締め切る</Button>
                </form>
              )}
            </>
          ) : (
            <form action={openPeriod} className="flex items-end gap-2">
              <input type="hidden" name="target_month" value={ym} />
              <div>
                <Label>希望提出の締切日</Label>
                <Input name="deadline" type="date" required />
              </div>
              <Button type="submit">{ym.replace("-", "年")}月分の募集を開始</Button>
            </form>
          )}
        </div>
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
