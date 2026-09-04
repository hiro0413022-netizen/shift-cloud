import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import type { Span } from "@yozan/core/frank-coach-capacity";

/**
 * FRANK のその日のコーチ（確定シフト）。体験の受入上限（#212）と
 * 会員ページのコーチ指名（#213）が同じ名簿を見るように、1か所にまとめた。
 *
 * ★ 出す人はオプトイン（staff.member_page_role が入っている人だけ・#209）
 * ★ 確定（published）シフトのみ。下書きは店の中の検討中の予定
 * ★ 時刻の無い行（キャディ等の業務区分・終日扱い）と休みの行は在席にしない
 */
const FRANK_STORE = "b54afb9f-22aa-4f4e-b758-bc2157acfdd5";

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export type CoachOnDuty = { id: string; name: string; s: number; e: number };
/** scheduled=false は「その日のシフトがまだ確定していない」（休みの行があれば確定とみなす） */
export type CoachRoster = { scheduled: boolean; coaches: CoachOnDuty[] };

export async function loadCoachRoster(admin: ReturnType<typeof createAdmin>, dateStr: string): Promise<CoachRoster> {
  const { data } = await admin
    .from("shifts")
    .select("staff_id, start_time, end_time, is_day_off, staff:staff_id(name, member_page_role)")
    .eq("store_id", FRANK_STORE)
    .eq("date", dateStr)
    .eq("status", "published")
    .is("deleted_at", null)
    .limit(50);

  type Row = {
    staff_id: string;
    start_time: string | null;
    end_time: string | null;
    is_day_off: boolean | null;
    staff: { name?: string | null; member_page_role?: string | null } | null;
  };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => String(r.staff?.member_page_role ?? "").trim() !== "");
  if (rows.length === 0) return { scheduled: false, coaches: [] };

  const coaches: CoachOnDuty[] = [];
  for (const r of rows) {
    if (r.is_day_off) continue;
    if (!r.start_time || !r.end_time) continue;
    coaches.push({
      id: String(r.staff_id),
      name: String(r.staff?.name ?? "").trim(),
      s: toMin(String(r.start_time)),
      e: toMin(String(r.end_time)),
    });
  }
  return { scheduled: true, coaches };
}

/** 体験の受入上限（#212）が使う形。null = シフト未確定 */
export function rosterCover(r: CoachRoster): Span[] | null {
  return r.scheduled ? r.coaches.map((c) => ({ s: c.s, e: c.e })) : null;
}
