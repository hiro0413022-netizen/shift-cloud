import { requireActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Empty } from "@/components/ui";
import { daysOfMonth, todayJST } from "@/lib/util";
import { RequestForm } from "./request-form";

export default async function RequestsPage() {
  const actor = await requireActor();
  const supabase = await createClient();

  // 募集中の期間（自店舗 or 全店対象）
  const { data: periods } = await supabase
    .from("shift_request_periods")
    .select("*")
    .eq("status", "open")
    .is("deleted_at", null)
    .gte("deadline", todayJST())
    .order("target_month");

  const period = (periods ?? []).find((p) => !p.store_id || actor.storeIds.includes(p.store_id));

  if (!period) {
    return (
      <>
        <h1 className="mb-2 text-lg font-semibold">シフト希望提出</h1>
        <Empty>現在募集中のシフト希望はありません</Empty>
      </>
    );
  }

  const ym = period.target_month.slice(0, 7);
  const days = daysOfMonth(ym);

  const [{ data: templates }, { data: existing }] = await Promise.all([
    supabase.from("shift_templates").select("id, name, start_time, end_time, is_day_off, color")
      .is("deleted_at", null).order("sort_order"),
    supabase.from("shift_requests").select("date, template_id, memo")
      .eq("period_id", period.id).eq("staff_id", actor.staffId).is("deleted_at", null),
  ]);

  return (
    <>
      <h1 className="text-lg font-semibold">シフト希望提出</h1>
      <p className="mb-4 mt-1 text-sm text-zinc-500">
        {ym.replace("-", "年")}月分 ・ 締切 {period.deadline}
      </p>
      <RequestForm
        periodId={period.id}
        days={days}
        templates={templates ?? []}
        existing={existing ?? []}
      />
    </>
  );
}
