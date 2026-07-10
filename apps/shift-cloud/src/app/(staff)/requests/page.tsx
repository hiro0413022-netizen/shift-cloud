import { requireActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Empty, Card, Badge, Button } from "@/components/ui";
import { daysOfMonth, daysBetween, fmtDateJP, todayJST, hm, dowJP } from "@/lib/util";
import { RequestForm } from "./request-form";
import { applyHelp } from "./actions";

export default async function RequestsPage() {
  const actor = await requireActor();
  const supabase = await createClient();
  const today = todayJST();

  const [{ data: periods }, { data: helps }, { data: myApps }] = await Promise.all([
    supabase.from("shift_request_periods").select("*")
      .eq("status", "open").is("deleted_at", null)
      .gte("deadline", today).order("target_month"),
    supabase.from("help_requests").select("*, stores(name)")
      .eq("status", "open").is("deleted_at", null)
      .in("store_id", actor.storeIds.length ? actor.storeIds : ["00000000-0000-0000-0000-000000000000"])
      .gte("date", today).order("date"),
    supabase.from("help_applications").select("help_request_id, status")
      .eq("staff_id", actor.staffId),
  ]);

  // 自分に該当する募集のうち、店舗個別を全店舗共通より優先（重複時の取り違え防止）
  const matched = (periods ?? []).filter((p) => !p.store_id || actor.storeIds.includes(p.store_id));
  const period = matched.find((p) => p.store_id) ?? matched[0];
  const appMap = new Map((myApps ?? []).map((a) => [a.help_request_id, a.status]));

  const APP_LABEL: Record<string, { label: string; color: "amber" | "green" | "zinc" }> = {
    pending: { label: "応募済み（審査中）", color: "amber" },
    accepted: { label: "採用されました", color: "green" },
    rejected: { label: "今回は見送り", color: "zinc" },
  };

  return (
    <div className="space-y-6">
      {!!helps?.length && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">出勤募集</h2>
          <p className="mb-3 text-sm text-zinc-500">人が足りない日です。出勤できる方は応募してください。</p>
          <div className="space-y-2">
            {helps.map((h) => {
              const st = appMap.get(h.id);
              return (
                <Card key={h.id} className="!p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        {h.date.slice(5)}（{dowJP(h.date)}） {hm(h.start_time)}〜{hm(h.end_time)}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {(h.stores as unknown as { name: string } | null)?.name} ・ 募集{h.needed_count}名
                        {h.note ? ` ・ ${h.note}` : ""}
                      </p>
                    </div>
                    {st ? (
                      <Badge color={APP_LABEL[st]?.color ?? "zinc"}>{APP_LABEL[st]?.label ?? st}</Badge>
                    ) : (
                      <form action={applyHelp}>
                        <input type="hidden" name="help_request_id" value={h.id} />
                        <Button type="submit" className="!px-3 !py-1.5">応募する</Button>
                      </form>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold">シフト提出</h2>
        {!period ? (
          <Empty>現在提出を受付中の期間はありません</Empty>
        ) : (
          <>
            <p className="mb-4 mt-1 text-sm text-zinc-500">
              {period.title ? `${period.title} ・ ` : ""}
              {period.start_date && period.end_date
                ? `${fmtDateJP(period.start_date)}〜${fmtDateJP(period.end_date)}`
                : `${period.target_month.slice(0, 7).replace("-", "年")}月分`}
              {" ・ 締切 "}{period.deadline}
              <br />
              <span className="text-xs">提出した内容は管理者の確認後に確定します。</span>
            </p>
            <RequestFormLoader
              periodId={period.id}
              ym={period.target_month.slice(0, 7)}
              startDate={period.start_date}
              endDate={period.end_date}
              staffId={actor.staffId}
            />
          </>
        )}
      </section>
    </div>
  );
}

async function RequestFormLoader({ periodId, ym, startDate, endDate, staffId }: { periodId: string; ym: string; startDate: string | null; endDate: string | null; staffId: string }) {
  const supabase = await createClient();
  const days = startDate && endDate ? daysBetween(startDate, endDate) : daysOfMonth(ym);
  const [{ data: templates }, { data: existing }] = await Promise.all([
    supabase.from("shift_templates").select("id, name, start_time, end_time, is_day_off, color")
      .is("deleted_at", null).order("sort_order"),
    supabase.from("shift_requests").select("date, template_id, memo, start_time, end_time")
      .eq("period_id", periodId).eq("staff_id", staffId).is("deleted_at", null),
  ]);
  return (
    <RequestForm periodId={periodId} days={days} templates={templates ?? []} existing={existing ?? []} />
  );
}
