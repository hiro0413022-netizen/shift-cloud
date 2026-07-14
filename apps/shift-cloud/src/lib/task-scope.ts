/**
 * やること(sp_tasks)の可視範囲（DECISIONS #55 / migration 0050）
 *
 * sp_tasks は2種類:
 *   - 個人あて  : staff_id = 本人
 *   - 店舗共通  : staff_id is null + store_id（例: Reserve OS の予約申込＝店の誰かが日程確認して折り返す）
 *
 * Supabase の .or() に渡すフィルタ文字列を組み立てる。
 * 所属店舗がない場合は個人あてのみ（店舗共通が全社に漏れないようにする）。
 */
export function taskScopeFilter(staffId: string, storeIds: string[]): string {
  const mine = `staff_id.eq.${staffId}`;
  if (!storeIds.length) return mine;
  return `${mine},and(staff_id.is.null,store_id.in.(${storeIds.join(",")}))`;
}

/** そのタスクが店舗共通（＝自分以外も見えている）か */
export function isSharedTask(t: { staff_id?: string | null }): boolean {
  return !t.staff_id;
}

/** 発信元のラベル（バッジ表示用） */
export const TASK_SOURCE_LABEL: Record<string, string> = {
  manual: "",
  manager: "店長",
  genesis: "本部",
  ai: "AI",
  reserve: "予約",
};
