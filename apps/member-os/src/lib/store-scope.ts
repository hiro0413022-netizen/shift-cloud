import "server-only";
import { cache } from "react";
import { createAdmin } from "@/lib/supabase/admin";
import { FRANK_STORE_ID } from "@yozan/core/frank-booking";

/**
 * 店舗スコープの共通判定（#128 店舗またぎ廃止 / #134 member-os 適用）
 *
 * GOLF WING（宝塚）と FRANK GOLF（姫路）は別店舗。自店舗のデータしか見えない/触れないのが正典。
 * オーナー判定は manage_company だけ（view_hq は本部・役員も持つので使わない）＝ @yozan/core/auth の actor.isOwner。
 *
 * ★ UIの出し分けだけでは守れない。読み書きの両方で必ずサーバー側でも絞る/検証すること。
 *   （(main)/actions.ts に散っていた scopedStoreId をここへ切り出した＝MODULARIZATION_PLAN「2回目で切り出す」）
 */

export { FRANK_STORE_ID };

/** GOLF WING 宝塚（stores.code）。UUIDは環境で変わりうるのでコードから引く */
export const GOLF_WING_STORE_CODE = "takarazuka";

/** どの行にも一致しない番人UUID。所属ゼロの人に「絞り込みなし＝全件」を絶対起こさせない */
export const NO_STORE_ID = "00000000-0000-0000-0000-000000000000";

/** 店舗スコープ判定に必要な最小のアクター（@yozan/core/auth の Actor がそのまま通る） */
export type StoreScopedActor = {
  isOwner: boolean;
  storeIds: string[];
  primaryStoreId: string | null;
};

/** その店舗を見て/触ってよいか。オーナーは全店（店舗未設定の古い行もオーナーだけは触れる） */
export function canAccessStore(actor: StoreScopedActor, storeId: string | null | undefined): boolean {
  if (actor.isOwner) return true;
  if (!storeId) return false;
  return actor.storeIds.includes(storeId);
}

/** 外れたら止める。サーバーアクション/データ層の最後の砦（#134） */
export function requireStoreAccess(actor: StoreScopedActor, storeId: string | null | undefined): void {
  if (!canAccessStore(actor, storeId)) throw new Error("FORBIDDEN: store");
}

/** 店舗またぎ事故の防止（#128）: オーナー以外はフォームの store_id が配属店舗でなければ主店舗に差し替える */
export function scopedStoreId(actor: StoreScopedActor, requested: string | null): string | null {
  if (actor.isOwner) return requested;
  if (requested && actor.storeIds.includes(requested)) return requested;
  return actor.primaryStoreId;
}

/**
 * 一覧クエリの `.in("store_id", …)` に渡す値。
 * null = 絞らない（オーナーのみ）。所属ゼロは NO_STORE_ID で0件にする。
 */
export function storeFilterIds(actor: StoreScopedActor): string[] | null {
  if (actor.isOwner) return null;
  return actor.storeIds.length > 0 ? actor.storeIds : [NO_STORE_ID];
}

/** 管理画面で見せてよい店舗（オーナー=全店 / それ以外=配属店舗のみ） */
export async function visibleStores(
  actor: StoreScopedActor & { companyId: string },
): Promise<Array<{ id: string; name: string }>> {
  if (!actor.isOwner && actor.storeIds.length === 0) return [];
  const admin = createAdmin();
  let q = admin
    .from("stores")
    .select("id, name")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("name");
  if (!actor.isOwner) q = q.in("id", actor.storeIds);
  const { data } = await q;
  return (data ?? []) as Array<{ id: string; name: string }>;
}

/** GOLF WING 宝塚の店舗ID（1リクエスト内でキャッシュ）。見つからなければ null */
export const golfWingStoreId = cache(async (companyId: string): Promise<string | null> => {
  const admin = createAdmin();
  const { data } = await admin
    .from("stores")
    .select("id")
    .eq("company_id", companyId)
    .eq("code", GOLF_WING_STORE_CODE)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
});

/** FRANK GOLF 姫路を見て/触ってよいか */
export function canAccessFrank(actor: StoreScopedActor): boolean {
  return canAccessStore(actor, FRANK_STORE_ID);
}

/** GOLF WING 宝塚を見て/触ってよいか（Smart Hello取込・宝塚の月次KPIの入口） */
export async function canAccessGolfWing(
  actor: StoreScopedActor & { companyId: string },
): Promise<boolean> {
  const id = await golfWingStoreId(actor.companyId);
  // 会社に GOLF WING 店舗が無ければオーナーでも false（外販テナント対応・#150）。
  // 旧実装は owner を無条件 true にしており、デモ/顧客テナントのオーナーに宝塚のUIが出ていた
  if (!id) return false;
  return canAccessStore(actor, id);
}

/** 会社が FRANK GOLF 姫路の店舗を持つか（外販テナント対応・#150）。1リクエスト内でキャッシュ */
export const companyHasFrank = cache(async (companyId: string): Promise<boolean> => {
  const admin = createAdmin();
  const { data } = await admin
    .from("stores")
    .select("id")
    .eq("company_id", companyId)
    .eq("id", FRANK_STORE_ID)
    .maybeSingle();
  return !!data;
});
