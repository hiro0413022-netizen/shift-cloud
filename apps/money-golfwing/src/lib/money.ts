import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import type { MoneyActor } from "@/lib/auth";

export type Segment = { id: string; code: string; name: string };

/** 金種（棚卸で使う額面） */
export const DENOMS = [10000, 5000, 1000, 500, 100, 50, 10, 5, 1];

/** このアプリが扱う事業（既定=GOLF WING）。環境変数で他事業アプリに転用可。 */
export function activeSegmentCode(): string {
  return process.env.MONEY_SEGMENT_CODE ?? "golf";
}

export async function getActiveSegment(companyId: string): Promise<Segment | null> {
  const admin = createAdmin();
  const { data } = await admin
    .from("fin_segments")
    .select("id, code, name")
    .eq("company_id", companyId)
    .eq("code", activeSegmentCode())
    .is("deleted_at", null)
    .single();
  return (data as Segment | null) ?? null;
}

/** 事業への書込権限（本部横断 or 当該事業のinput/manager） */
export function canWriteSegment(actor: MoneyActor, segmentId: string): boolean {
  if (actor.canManageAll) return true;
  return actor.grants.some(
    (g) => g.segmentId === segmentId && (g.role === "input" || g.role === "manager")
  );
}

/** 直近の現金残高（現金出納の最新行） */
export async function latestCashBalance(companyId: string, segmentId: string): Promise<number> {
  const admin = createAdmin();
  const { data } = await admin
    .from("mon_cash_ledger")
    .select("balance, entry_date, created_at")
    .eq("company_id", companyId)
    .eq("segment_id", segmentId)
    .is("deleted_at", null)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const b = data?.[0]?.balance;
  return b == null ? 0 : Number(b);
}

/** "1,234" / 全角 → number */
export function toNum(input: FormDataEntryValue | null): number {
  if (input == null) return 0;
  let s = String(input).trim().replace(/[",，\s]/g, "");
  s = s.replace(/[０-９．－]/g, (c) => "0123456789.-"["０１２３４５６７８９．－".indexOf(c)]);
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** "YYYY-MM" → その月の月初/翌月初 */
export function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const nm = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from, to: nm };
}
