import { createAdmin } from "@/lib/supabase/admin";
import { jstYmd } from "@/lib/jst";
import { FRANK_STORE_ID } from "@yozan/core/frank-booking";
import { logEvent } from "@/lib/kernel";

/**
 * FRANK GOLF: 日が過ぎた予約を自動で「来店」にする（#205・2026-09-03 ユーザー指示
 * 「フランクゴルフに関しては来店を押さなくても来店としてください」）
 *
 * ★ なぜ入れるか
 *   実測では9月の体験予約30件すべてが confirmed のままで、**【来店】は一度も押されていなかった**。
 *   押す前提の数字（体験人数・入会率・来店履歴）は、押されない限り永遠に0のままになる。
 *   「押させる」運用に賭けるより、**押さなくても正しい方に倒す**。
 *
 * ★ 触るのは「日付が過ぎた confirmed」だけ
 *   ・cancelled / no_show / visited には触らない（スタッフが決めた事実を上書きしない）
 *   ・当日ぶんは触らない（まだ来る）。翌朝6時のcronで前日ぶんが来店になる
 *   ・GOLF WING は対象外（あちらは Smart Hello が正典）
 *
 * ★ 「来なかった人」は【無断欠】で直せる
 *   自動で来店にする以上、無断キャンセルだけはスタッフが押す必要がある。
 *   押せば受付台帳からも下がる（member-os の setBookingStatus）ので、体験数から消える。
 */
export async function runFrankAutoVisited(): Promise<Record<string, unknown>> {
  const admin = createAdmin();
  const today = jstYmd();
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await admin
    .from("frunk_bookings")
    .update({ status: "visited", updated_at: nowIso })
    .eq("store_id", FRANK_STORE_ID)
    .eq("status", "confirmed")
    .lt("booked_date", today)
    .is("deleted_at", null)
    .select("id, company_id, booked_date, start_time, customer_kind, trial_request_id");

  if (error) return { date: today, error: error.message };
  const list = (rows ?? []) as Array<{
    id: string;
    company_id: string;
    booked_date: string;
    start_time: string | null;
    customer_kind: string | null;
    trial_request_id: string | null;
  }>;
  if (list.length === 0) return { date: today, visited: 0 };

  let trials = 0;
  for (const b of list) {
    if (!b.trial_request_id) continue;
    trials++;
    // 体験は申込側も「来店済」にそろえる（2画面で食い違わせない）
    await admin
      .from("mbr_trial_requests")
      .update({ status: "done", updated_at: nowIso })
      .eq("id", b.trial_request_id)
      .eq("status", "confirmed");
    // 受付台帳にも来店の時刻を入れる（打刻の代わり。既に入っていれば触らない）
    const at = `${b.booked_date}T${String(b.start_time ?? "00:00").slice(0, 5)}:00+09:00`;
    await admin
      .from("mbr_walkin_visits")
      .update({ arrived_at: at, updated_at: nowIso })
      .eq("source_reservation_no", `FRANK-TRIAL-${b.trial_request_id}`)
      .is("arrived_at", null)
      .is("deleted_at", null);
  }

  await logEvent(String(list[0].company_id), {
    event_type: "frank.booking.auto_visited",
    title: `FRANK: 日付の過ぎた予約 ${list.length}件を来店にしました（体験 ${trials}件）`,
    description: "【来店】を押さなくても来店として数えます（#205）。来られなかった方は【無断欠】で直してください",
    source: "cron",
    source_type: "system",
    severity: "info",
  });

  return { date: today, visited: list.length, trials };
}
