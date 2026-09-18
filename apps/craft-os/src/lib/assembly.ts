import type { QuoteItem, WorkOrder, WorkSpec } from "@/lib/craft";

/**
 * 組立データを残す注文か（2026-09-19 ユーザー判断: グリップ交換などは不要。線引きは手動で切り替えられること）。
 *   work.assembly_record が true/false ならそれに従う（手で決めた）
 *   null（未設定）のときは自動: シャフトの明細か組立指示書の行があれば「残す」
 */
export function needsAssemblyRecord(
  work: Pick<WorkOrder, "assembly_record"> | null,
  items: Pick<QuoteItem, "line_kind" | "item_category">[],
  specs: unknown[],
): boolean {
  if (!work) return false;
  if (work.assembly_record === true || work.assembly_record === false) return work.assembly_record;
  return specs.length > 0 || items.some((i) => i.line_kind === "product" && i.item_category === "シャフト");
}

/** 組立データが1本でも入っているか（お礼状を出せるか） */
export function hasAssemblyData(specs: Pick<WorkSpec, "actual_length" | "actual_weight" | "actual_balance" | "actual_cpm">[]): boolean {
  return specs.some((s) => s.actual_length != null || s.actual_weight != null || (s.actual_balance ?? "") !== "" || s.actual_cpm != null);
}
