import { createAdmin } from "@/lib/supabase/admin";
import { jstYmd } from "@/lib/jst";
import { FRANK_STORE_ID } from "@yozan/core/frank-booking";
import { logEvent } from "@/lib/kernel";
import { visitClosed, hhmmToMin, VISIT_GRACE_MIN, VISIT_NO_BOOKING_MIN } from "@yozan/core/frank-portal";

/**
 * FRANK GOLF: 終わった予約を自動で「来店」にする（#205・2026-09-03 ユーザー指示
 * 「来店を押さなくても来店としてください」→「翌朝ではなく、レッスン時間を過ぎたら来店済みに」）
 *
 * ★ なぜ入れるか
 *   実測では9月の体験予約30件すべてが confirmed のままで、**【来店】は一度も押されていなかった**。
 *   押す前提の数字（体験人数・入会率・来店履歴）は、押されない限り永遠に0のままになる。
 *   「押させる」運用に賭けるより、**押さなくても正しい方に倒す**。
 *
 * ★ 判定は「終了時刻を過ぎたか」（当日ぶんもその場で来店になる）
 *   前日以前 … 全部
 *   当日     … **end_time を過ぎたものだけ**（まだ打っている人を来店済にしない）
 *   10分ごとのcronから呼ぶので、レッスンが終われば最大10分で来店になる。
 *   日次cronからも呼ぶ（10分cronが止まっていても翌朝には必ず揃う二重の保険）。
 *
 * ★ 触るのは confirmed だけ
 *   ・cancelled / no_show / visited には触らない（スタッフが決めた事実を上書きしない）
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
  // いまの JST 時刻（"HH:MM"）。当日ぶんは「終了時刻を過ぎたか」で判定する
  const nowHm = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(11, 16);

  // 対象を先に読む（当日ぶんは end_time の比較が要るので、更新条件だけでは絞り切れない）
  const { data: cand, error: readErr } = await admin
    .from("frunk_bookings")
    .select("id, company_id, booked_date, start_time, end_time, customer_kind, trial_request_id")
    .eq("store_id", FRANK_STORE_ID)
    .eq("status", "confirmed")
    .lte("booked_date", today)
    .is("deleted_at", null)
    .order("booked_date", { ascending: true })
    .limit(500);
  if (readErr) return { date: today, error: readErr.message };

  const list = ((cand ?? []) as Array<{
    id: string;
    company_id: string;
    booked_date: string;
    start_time: string | null;
    end_time: string | null;
    customer_kind: string | null;
    trial_request_id: string | null;
  }>).filter((b) =>
    b.booked_date < today
      ? true // 前日以前は終わっている
      : String(b.end_time ?? "23:59").slice(0, 5) <= nowHm // 当日は終了時刻を過ぎたものだけ
  );
  if (list.length === 0) return { date: today, now: nowHm, visited: 0 };

  const { error } = await admin
    .from("frunk_bookings")
    .update({ status: "visited", updated_at: nowIso })
    .in("id", list.map((b) => b.id))
    .eq("status", "confirmed"); // 読んでから更新までの間に誰かが押していたら譲る
  if (error) return { date: today, error: error.message };

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
    title: `FRANK: 終わった予約 ${list.length}件を来店にしました（体験 ${trials}件）`,
    description: "終了時刻を過ぎたら自動で来店になります（#205）。来られなかった方は【無断欠】で直してください",
    source: "cron",
    source_type: "system",
    severity: "info",
  });

  return { date: today, now: nowHm, visited: list.length, trials };
}


/**
 * FRANK GOLF: 利用時間を過ぎた在店を自動で「退店」にする（#220・2026-09-05 ユーザー報告
 * 「利用時間が過ぎても退店にならない」）
 *
 * ★ 何が起きていたか
 *   チェックイン（QR・店頭・打席）は `frunk_checkins` に行を作るが、**退店は電子伝票の
 *   【退店】を押したときだけ** `checked_out_at` が入る（#164）。押し忘れると
 *   「来店中」に残り続け、翌日以降も一覧に出る。
 *   お客様のスマホ側は #163 の判定（`visitClosed`）で来店中を閉じているので、
 *   **画面では帰った人が、DBでは在店のまま**という食い違いになっていた。
 *
 * ★ 直し方
 *   その判定（予約があれば終了+30分、無ければチェックイン+2時間）を**そのままDBにも書く**。
 *   ルールは `@yozan/core/frank-portal` の1か所のまま＝会員のスマホと店頭で食い違わない。
 *
 * ★ スタッフが押した退店は上書きしない（`checked_out_at is null` の行だけ）。
 *   前日以前の在店は、時刻が取れなくても閉じる（日付が変われば在店ではない）。
 */
export async function runFrankAutoCheckout(): Promise<Record<string, unknown>> {
  const admin = createAdmin();
  const today = jstYmd();
  const nowIso = new Date().toISOString();
  const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const nowMin = jstNow.getUTCHours() * 60 + jstNow.getUTCMinutes();

  const { data: rows } = await admin
    .from("frunk_checkins")
    .select("id, company_id, visited_on, checked_in_at, booking_id, frunk_bookings(end_time)")
    .lte("visited_on", today)
    .is("checked_out_at", null)
    .is("deleted_at", null)
    .order("visited_on", { ascending: true })
    .limit(300);

  type Row = {
    id: string;
    company_id: string;
    visited_on: string;
    checked_in_at: string | null;
    frunk_bookings: { end_time: string | null } | null;
  };
  const list = ((rows ?? []) as unknown as Row[]).filter((r) => {
    // 前日以前は無条件で閉じる（日付が変わっている＝もう在店ではない）
    if (r.visited_on < today) return true;
    const endMin = hhmmToMin(r.frunk_bookings?.end_time ?? null);
    const inMin = r.checked_in_at
      ? (() => {
          const d = new Date(new Date(r.checked_in_at).getTime() + 9 * 3600 * 1000);
          return d.getUTCHours() * 60 + d.getUTCMinutes();
        })()
      : null;
    return visitClosed({ nowMin, endMin, checkedInMin: inMin });
  });
  if (list.length === 0) return { date: today, checkedOut: 0 };

  await admin
    .from("frunk_checkins")
    .update({ checked_out_at: nowIso })
    .in("id", list.map((r) => r.id))
    .is("checked_out_at", null); // スタッフが押した退店は上書きしない

  await logEvent(String(list[0].company_id), {
    event_type: "frank.checkin.auto_checkout",
    title: `FRANK: 利用時間を過ぎた在店 ${list.length}件を退店にしました`,
    description: `予約ありは終了+${VISIT_GRACE_MIN}分、予約なしはチェックイン+${VISIT_NO_BOOKING_MIN}分で自動退店します（#220）`,
    source: "cron",
    source_type: "system",
    severity: "info",
  });

  return { date: today, checkedOut: list.length };
}
