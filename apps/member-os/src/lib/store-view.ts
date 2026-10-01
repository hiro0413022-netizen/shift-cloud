// store-view.ts — 受付台帳・名簿Excelで表示する店舗を決める純粋関数（server-only禁止・tests から直接import）
const NO_STORE_ID = "00000000-0000-0000-0000-000000000000";
type StoreScopedActor = { isOwner: boolean; storeIds: string[]; primaryStoreId: string | null };

/**
 * 受付台帳・名簿Excelで「どの店舗を表示するか」を決める（2026-10-01 実障害）。
 *
 * 旧実装はオーナー／両店配属の人に全店をまとめて出しており、
 * GOLF WING を見ているつもりの画面・Excel に FRANK GOLF で登録した方が混ざっていた。
 * → 見える店舗が2つ以上ある人は**既定で1店舗**（主店舗）に絞り、全店は明示的に「全店」を選んだときだけ。
 *
 * @param visibleIds その人が見てよい店舗（visibleStores の id）
 * @param requested  URLの ?store= （店舗ID / "all" / 空）
 * @returns storeIds = .in("store_id", …) に渡す値（必ず配列。空なら0件）／selected = 画面のタブ選択
 */
export function resolveStoreView(
  actor: StoreScopedActor,
  visibleIds: string[],
  requested: string | null | undefined,
): { storeIds: string[]; selected: string } {
  if (visibleIds.length === 0) return { storeIds: [NO_STORE_ID], selected: "" };
  if (requested === "all" && visibleIds.length > 1) return { storeIds: visibleIds, selected: "all" };
  if (requested && visibleIds.includes(requested)) return { storeIds: [requested], selected: requested };
  const def =
    actor.primaryStoreId && visibleIds.includes(actor.primaryStoreId) ? actor.primaryStoreId : visibleIds[0];
  return { storeIds: [def], selected: def };
}
