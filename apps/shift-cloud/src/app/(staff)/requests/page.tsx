import Link from "next/link";
import { requireActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Badge, Button } from "@/components/ui";
import { daysOfMonth, todayJST, hm, dowJP, addMonths, currentYM } from "@/lib/util";
import { templatesForStores } from "@/lib/shift-scope";
import { RequestForm } from "./request-form";
import { TimeOffSection } from "./time-off-section";
import { applyHelp } from "./actions";

const YM_RE = /^\d{4}-\d{2}$/;

/**
 * シフト提出（#138 募集期間の廃止）
 * 管理者が「募集を開始」しなくても、今日以降ならいつでも・何ヶ月先でも出せる。
 * 月送り（←/→）で対象月を選ぶだけ。確定済みの日はロックして見せる。
 */
export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ ym?: string }> }) {
  const actor = await requireActor();
  const supabase = await createClient();
  const sp = await searchParams;
  const today = todayJST();
  const thisYM = currentYM();
  // 既定は翌月（普段いちばん出す月）。?ym= で今月にも先の月にも移動できる
  const ym = sp.ym && YM_RE.test(sp.ym) ? sp.ym : addMonths(thisYM, 1);
  const days = daysOfMonth(ym);
  const from = days[0];
  const to = days[days.length - 1];

  const [{ data: helps }, { data: myApps }, { data: myTimeOff }, { data: templates }, { data: existing }, { data: myShifts }] =
    await Promise.all([
      supabase.from("help_requests").select("*, stores(name)")
        .eq("status", "open").is("deleted_at", null)
        .in("store_id", actor.storeIds.length ? actor.storeIds : ["00000000-0000-0000-0000-000000000000"])
        .gte("date", today).order("date"),
      supabase.from("help_applications").select("help_request_id, status")
        .eq("staff_id", actor.staffId),
      // 休み希望は月に関係なく、これから先の分を見せる
      supabase.from("staff_time_off_requests")
        .select("id, start_date, end_date, kind, reason, status, decision_note")
        .eq("staff_id", actor.staffId).is("deleted_at", null)
        .gte("end_date", today).order("start_date"),
      supabase.from("shift_templates").select("id, name, start_time, end_time, is_day_off, color, scope_type, scope_id")
        .is("deleted_at", null).order("sort_order"),
      supabase.from("shift_requests").select("date, template_id, memo, start_time, end_time")
        .eq("staff_id", actor.staffId).eq("status", "submitted").is("deleted_at", null)
        .gte("date", from).lte("date", to),
      // 確定済み(published)の日は出し直せない。何時から入っているかも見せる
      supabase.from("shifts").select("date, start_time, end_time, is_day_off, status")
        .eq("staff_id", actor.staffId).is("deleted_at", null)
        .gte("date", from).lte("date", to),
    ]);

  const appMap = new Map((myApps ?? []).map((a) => [a.help_request_id, a.status]));
  // 店舗ごとに営業時間が違うので、自分の店舗のテンプレだけ見せる（DECISIONS #131）
  const visibleTemplates = templatesForStores(templates ?? [], actor.storeIds);
  const locked = Object.fromEntries(
    (myShifts ?? []).filter((s) => s.status === "published")
      .map((s) => [s.date, { start_time: s.start_time, end_time: s.end_time, is_day_off: s.is_day_off }]),
  );

  const APP_LABEL: Record<string, { label: string; color: "amber" | "green" | "zinc" }> = {
    pending: { label: "応募済み（審査中）", color: "amber" },
    accepted: { label: "採用されました", color: "green" },
    rejected: { label: "今回は見送り", color: "zinc" },
  };

  const ymLabel = `${Number(ym.slice(0, 4))}年${Number(ym.slice(5))}月`;

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

      <TimeOffSection mine={myTimeOff ?? []} today={today} />

      <section>
        <h2 className="text-lg font-semibold">シフト提出</h2>
        <p className="mb-3 mt-1 text-sm text-zinc-500">
          いつでも出せます。締切はありません。あとから何度でも直せます（管理者が確定した日をのぞく）。
        </p>

        {/* 月送り。先の月も自由に開ける＝先に決まっている予定を早めに入れられる（#138） */}
        <div className="mb-3 flex items-center gap-3">
          <Link href={`/requests?ym=${addMonths(ym, -1)}`} aria-label="前の月"
            className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-zinc-400">←</Link>
          <p className="font-semibold">{ymLabel}</p>
          <Link href={`/requests?ym=${addMonths(ym, 1)}`} aria-label="次の月"
            className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-zinc-400">→</Link>
          {ym !== thisYM && (
            <Link href={`/requests?ym=${thisYM}`} className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-500">
              今月
            </Link>
          )}
        </div>

        {to < today ? (
          <Card className="!p-4">
            <p className="text-sm text-zinc-400">{ymLabel}はもう過ぎています。→ で先の月へ移動してください。</p>
          </Card>
        ) : (
          <RequestForm
            from={from}
            to={to}
            days={days}
            today={today}
            ymLabel={ymLabel}
            templates={visibleTemplates}
            existing={existing ?? []}
            locked={locked}
          />
        )}
      </section>
    </div>
  );
}
