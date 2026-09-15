import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import type { GenesisActor } from "@/lib/auth";
import { storeScope } from "@/lib/auth";
import { storeInValues } from "@/lib/kernel";

/**
 * メニューに出す「たまっている件数」（#244）。
 * 承認・AI ＝ 人が押さないと進まないもの／お客様 ＝ 外から来て返事を待っているもの。
 * 判断フィード（judgment-feed）と同じテーブル・同じ条件で **件数だけ** 数える。
 * 全ページのレイアウトで呼ぶので head:true の count クエリだけにして軽く保つ。
 */
export type NavBadges = { approve: number; customers: number; stalled: number };

export async function getNavBadges(actor: GenesisActor, stalled = 0): Promise<NavBadges> {
  const admin = createAdmin();
  const companyId = actor.companyId;
  const scope = storeScope(actor);
  const allowed = Array.isArray(scope) ? new Set(scope) : null;
  const byStore = <T,>(q: T): T =>
    allowed ? (q as unknown as { in: (c: string, v: string[]) => T }).in("store_id", storeInValues(allowed)) : q;
  const head = { count: "exact" as const, head: true };

  const [ap, queue, deliv, inq, trial, join, resv] = await Promise.all([
    admin.from("approval_requests").select("id", head).eq("company_id", companyId).eq("status", "pending"),
    admin.from("ai_action_queue").select("id", head).eq("company_id", companyId).eq("status", "awaiting_approval"),
    admin.from("ai_execution_logs").select("id", head).eq("company_id", companyId).eq("review_status", "pending"),
    admin
      .from("sec_inquiries")
      .select("id", head)
      .eq("company_id", companyId)
      .in("status", ["new", "awaiting_approval"])
      .is("deleted_at", null),
    byStore(admin.from("mbr_trial_requests").select("id", head).eq("company_id", companyId).eq("status", "pending").is("deleted_at", null)),
    byStore(admin.from("frunk_members").select("id", head).eq("company_id", companyId).eq("status", "pending").is("deleted_at", null)),
    admin.from("res_requests").select("id", head).eq("company_id", companyId).eq("status", "pending").is("deleted_at", null),
  ]);
  const n = (r: { count: number | null }) => r.count ?? 0;
  return {
    approve: n(ap) + n(queue) + n(deliv),
    customers: n(inq) + n(trial) + n(join) + n(resv),
    stalled,
  };
}
