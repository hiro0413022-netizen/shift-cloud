import "server-only";
import type { GenesisActor } from "@/lib/auth";
import { storeScope } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { SYSTEM_CARDS, mergeSystemCards, type RawLink, type SystemCard } from "@/lib/store-links";

/**
 * ホームの「システムへ直行」カード（#248）。
 * sp_links（Shift Cloud 店舗ダッシュボードの業務リンクと同じ台帳）を足す。
 * 店舗スコープの人（#134）には、見られる店舗のリンクと全店共通のリンクだけを出す。
 * 台帳が読めなくても既知アプリのカードは必ず出す。
 */
export async function getSystemCards(actor: GenesisActor): Promise<SystemCard[]> {
  try {
    const admin = createAdmin();
    const { data, error } = await admin
      .from("sp_links")
      .select("id, label, url, note, store_id, stores(name)")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("sort");
    if (error) return SYSTEM_CARDS;
    const scope = storeScope(actor);
    const allowed = Array.isArray(scope) ? new Set(scope) : null;
    const rows = (data ?? []) as unknown as { id: string; label: string; url: string; note: string | null; store_id: string | null; stores: { name: string } | null }[];
    const links: RawLink[] = rows
      .filter((r) => !r.store_id || !allowed || allowed.has(r.store_id))
      .map((r) => ({ id: r.id, label: r.label, url: r.url, note: r.note, store: r.stores?.name ?? null }));
    return mergeSystemCards(SYSTEM_CARDS, links);
  } catch {
    return SYSTEM_CARDS;
  }
}
