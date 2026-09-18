import type { FinishInfo } from "@/components/paper";
import type { FullQuote } from "@/lib/craft";

/**
 * 注文書の「仕上げ情報」（赤枠）。1本目の組立仕様から出す。
 * 組み上がりの実測があれば実測、無ければ目標（範囲）。
 */
export function finishInfoOf(full: Pick<FullQuote, "specs">): FinishInfo {
  const s = full.specs[0];
  const r = (a: unknown, b: unknown, unit = "") => {
    const x = a == null || a === "" ? "" : String(a);
    const y = b == null || b === "" ? "" : String(b);
    if (!x && !y) return "";
    if (x && y) return x === y ? `${x}${unit}` : `${x} 〜 ${y}${unit}`;
    return `${x || y}${unit}`;
  };
  return {
    head: s?.head_name ?? "",
    balance: s?.actual_balance ?? r(s?.balance_min, s?.balance_max),
    cpm: s?.actual_cpm != null ? `${s.actual_cpm}cpm` : r(s?.cpm_min, s?.cpm_max, "cpm"),
    weight: s?.actual_weight != null ? `${s.actual_weight}g` : r(s?.weight_min, s?.weight_max, "g"),
    length: s?.actual_length != null ? `${s.actual_length}inch` : r(s?.length_min, s?.length_max, "inch"),
    note: s?.spec_note ?? "",
  };
}
