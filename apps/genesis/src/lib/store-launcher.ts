import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { jstYmd } from "@/lib/jst";
import { launcherCards, type LauncherCard } from "@/lib/store-links";

/**
 * 店舗のシステムへ直行する入口（#244 ⑧）。
 * 入口に「今日の状態」（予約12件・来店8名・出勤3名）を添える＝件数が0の日は薄く、たまっている日は目立つ。
 * 件数の出どころ: frunk_bookings（FRANKの打席予約）／mbr_walkin_visits（受付台帳）／shifts（確定シフト）。
 * 他のアプリ（工房・在庫・コンペ）は入口のみ（件数は将来足す）。
 */
export type LauncherStatus = { label: string; count: number | null; hot?: boolean };

export type StoreLauncher = {
  store: { id: string; name: string; isFrank: boolean };
  cards: (LauncherCard & { status: LauncherStatus | null })[];
};

export async function getStoreLauncher(companyId: string, store: { id: string; name: string; code: string | null }): Promise<StoreLauncher> {
  const admin = createAdmin();
  const today = jstYmd();
  const isFrank = (store.code ?? "").startsWith("frunk");
  const head = { count: "exact" as const, head: true };

  const [bookings, visits, shifts, trials] = await Promise.all([
    isFrank
      ? admin
          .from("frunk_bookings")
          .select("id", head)
          .eq("company_id", companyId)
          .eq("store_id", store.id)
          .eq("booked_date", today)
          .neq("status", "cancelled")
          .is("deleted_at", null)
          .then((r) => (r.error ? null : (r.count ?? 0)))
      : Promise.resolve(null),
    admin
      .from("mbr_walkin_visits")
      .select("id", head)
      .eq("company_id", companyId)
      .eq("store_id", store.id)
      .eq("visited_on", today)
      .is("deleted_at", null)
      .then((r) => (r.error ? null : (r.count ?? 0))),
    admin
      .from("shifts")
      .select("id", head)
      .eq("company_id", companyId)
      .eq("store_id", store.id)
      .eq("date", today)
      .eq("status", "published")
      .then((r) => (r.error ? null : (r.count ?? 0))),
    admin
      .from("mbr_trial_requests")
      .select("id", head)
      .eq("company_id", companyId)
      .eq("store_id", store.id)
      .eq("status", "pending")
      .is("deleted_at", null)
      .then((r) => (r.error ? null : (r.count ?? 0))),
  ]);

  const statusOf = (key: string): LauncherStatus | null => {
    if (key === "reservations") {
      if (isFrank) return { label: "今日の予約", count: bookings, hot: (trials ?? 0) > 0 };
      return trials != null ? { label: "体験の申込 待ち", count: trials, hot: trials > 0 } : null;
    }
    if (key === "reception") return { label: "今日の来店", count: visits };
    if (key === "shift") return { label: "今日の出勤", count: shifts, hot: shifts === 0 };
    return null;
  };

  return {
    store: { id: store.id, name: store.name, isFrank },
    cards: launcherCards(isFrank).map((c) => ({ ...c, status: statusOf(c.key) })),
  };
}
