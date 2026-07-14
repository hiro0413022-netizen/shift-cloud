import "server-only";
import { cookies } from "next/headers";
import { createAdmin } from "@/lib/supabase/admin";
import type { MoneyActor, AccessibleStore } from "@/lib/auth";

/** 金種（棚卸で使う額面） */
export const DENOMS = [10000, 5000, 1000, 500, 100, 50, 10, 5, 1];

export const STORE_COOKIE = "mg_store";

/** 現在選択中の店舗（cookie）。未選択なら主店舗→先頭。アクセス外のcookieは無視。 */
export async function getCurrentStore(actor: MoneyActor): Promise<AccessibleStore | null> {
  if (actor.stores.length === 0) return null;
  const jar = await cookies();
  const sel = jar.get(STORE_COOKIE)?.value;
  return (
    actor.stores.find((s) => s.id === sel) ??
    actor.stores.find((s) => s.isPrimary) ??
    actor.stores[0]
  );
}

/** その店舗に書き込めるか（本部は全店舗、現場は配属店舗） */
export function canWriteStore(actor: MoneyActor, storeId: string): boolean {
  if (actor.canManageAll) return true;
  return actor.stores.some((s) => s.id === storeId);
}

/** 直近の現金残高（店舗別・現金出納の最新行） */
export async function latestCashBalance(companyId: string, storeId: string): Promise<number> {
  const admin = createAdmin();
  const { data } = await admin
    .from("mon_cash_ledger")
    .select("balance, entry_date, created_at")
    .eq("company_id", companyId)
    .eq("store_id", storeId)
    .is("deleted_at", null)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const b = data?.[0]?.balance;
  return b == null ? 0 : Number(b);
}

// 純粋ユーティリティは money-util.ts へ集約（テスト対象）。既存importの互換のため再export。
export { toNum, monthRange } from "@/lib/money-util";
