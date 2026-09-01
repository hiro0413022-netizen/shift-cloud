import { createAdmin } from "@/lib/supabase/admin";
import { jstYmd } from "@/lib/jst";

/**
 * FRANK GOLF 退会・休会の予約を当日に反映する（#192・2026-09-01）
 *
 * スタッフは「10月末で退会」「11月から休会」のように **先の日付で受け付ける**（member-os の会員カード）。
 * status はその日まで active のまま＝予約も取れるし会員証も使える。
 * 日次cron（6:00 JST）でその日が来たものだけ切り替える。
 *
 * ★ お金はここに依存していない。
 *   受付の時点で Square 側に canceled_date / pause_effective_date を入れて予約済みにしてある。
 *   このcronが1日遅れても請求は正しい日付で止まる（逆に、ここで status を変えても Square は動かない）。
 *
 * ★ 退会日は「その日までは在籍」。10/31退会なら 10/31 は使えて、11/1 に left へ落とす。
 */
export async function runFrankMembershipSchedule(): Promise<Record<string, unknown>> {
  const admin = createAdmin();
  const today = jstYmd();
  const nowIso = new Date().toISOString();

  // 休会: 開始日が来たら（当日から）休会にする
  const { data: suspended, error: e1 } = await admin
    .from("frunk_members")
    .update({ status: "suspended", suspend_start: today, scheduled_suspend_start: null, updated_at: nowIso })
    .lte("scheduled_suspend_start", today)
    .eq("status", "active")
    .is("deleted_at", null)
    .select("id, member_no, name");

  // 退会: 退会日を **過ぎたら**（翌日に）退会にする
  const { data: left, error: e2 } = await admin
    .from("frunk_members")
    .update({ status: "left", leave_date: today, scheduled_leave_date: null, scheduled_suspend_start: null, updated_at: nowIso })
    .lt("scheduled_leave_date", today)
    .in("status", ["active", "suspended"])
    .is("deleted_at", null)
    .select("id, member_no, name, scheduled_leave_date");

  // leave_date は「退会日そのもの」を残したいので、切り替えた行だけ入れ直す
  for (const row of left ?? []) {
    const on = (row as { scheduled_leave_date?: string | null }).scheduled_leave_date;
    if (on) await admin.from("frunk_members").update({ leave_date: on }).eq("id", (row as { id: string }).id);
  }

  return {
    date: today,
    suspended: (suspended ?? []).map((r) => (r as { member_no?: string }).member_no ?? ""),
    left: (left ?? []).map((r) => (r as { member_no?: string }).member_no ?? ""),
    ...(e1 || e2 ? { error: `${e1?.message ?? ""} ${e2?.message ?? ""}`.trim() } : {}),
  };
}
