import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { FRANK_STORE_ID, jstToday, loadBookingCfg, businessHours } from "@yozan/core/frank-booking";
import { addDaysStr, labelJa } from "@/lib/bay-timeline-pure";

/**
 * 会員ページに出す「コーチ・スタッフの出勤予定」（#209・2026-09-03 ユーザー依頼）
 *
 * ★ 出す人はオプトイン（staff.member_page_role が入っている人だけ・migration 0146）
 *   除外リスト方式にすると、新しく入った人や店舗ログイン用アカウントが既定でお客様に出てしまう。
 *   **この関数は「出していい」と決めた人以外を絶対に返さない。**
 *
 * ★ 確定したシフトだけ（status='published'）
 *   下書きは店の中の検討中の予定。お客様に見せて「いると思って来たのにいない」を作らない。
 *
 * ★ 休みの人は行ごと出さない
 *   会員が知りたいのは「誰がいるか」。いない人の名前を並べても探しにくくなるだけ。
 */

export type CoachDay = {
  date: string;
  label: string; // 「9/5（土）」
  isToday: boolean;
  /** 定休日。誰もいないのではなく店が開いていない日（「未定」と区別する） */
  closed: boolean;
  people: Array<{ name: string; role: string; time: string }>;
};

export async function loadCoachShifts(days = 14): Promise<CoachDay[]> {
  const admin = createAdmin();
  const cfg = await loadBookingCfg(admin); // 定休日を「未定」と混同しないため
  const from = jstToday();
  const to = addDaysStr(from, Math.max(1, days) - 1);

  const { data } = await admin
    .from("shifts")
    .select("date, start_time, end_time, is_day_off, status, staff:staff_id(name, member_page_role, sort_order)")
    .eq("store_id", FRANK_STORE_ID)
    .eq("status", "published")
    .eq("is_day_off", false)
    .gte("date", from)
    .lte("date", to)
    .is("deleted_at", null)
    .order("date", { ascending: true })
    .limit(500);

  type Row = {
    date: string;
    start_time: string | null;
    end_time: string | null;
    staff: { name?: string | null; member_page_role?: string | null; sort_order?: number | null } | null;
  };

  const byDate = new Map<string, CoachDay["people"]>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const role = String(r.staff?.member_page_role ?? "").trim();
    if (!role) continue; // ★ 出していい人以外は返さない
    if (!r.start_time || !r.end_time) continue; // 時間が決まっていない行は出さない
    const list = byDate.get(r.date) ?? [];
    list.push({
      name: String(r.staff?.name ?? "").trim(),
      role,
      time: `${String(r.start_time).slice(0, 5)}〜${String(r.end_time).slice(0, 5)}`,
    });
    byDate.set(r.date, list);
  }

  const out: CoachDay[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDaysStr(from, i);
    out.push({
      date: d,
      label: labelJa(d),
      isToday: d === from,
      closed: businessHours(d, cfg) === null,
      people: (byDate.get(d) ?? []).sort((a, b) => a.time.localeCompare(b.time)),
    });
  }
  return out;
}
