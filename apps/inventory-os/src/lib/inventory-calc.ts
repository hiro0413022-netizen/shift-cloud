/**
 * 在庫の純粋計算（server-only を付けない＝ node --test から直接importできる）。
 * DB・認証に触れるものは lib/inventory.ts 側に置く。
 */

export type MovementKind = "receipt" | "sale" | "workshop" | "adjust" | "damage" | "transfer";

export const MOVEMENT_LABEL: Record<MovementKind, string> = {
  receipt: "入荷",
  sale: "販売",
  workshop: "工房使用",
  adjust: "棚卸調整",
  damage: "破損・廃棄",
  transfer: "店舗間移動",
};

/** 出庫として扱う種別。画面ではマイナスを打たせず、種別で符号を決める */
export const OUTBOUND_KINDS: MovementKind[] = ["sale", "workshop", "damage"];

/**
 * 入出庫の符号を決める。
 * 入力は常に正の数を受け取る前提で、負値や小数が来ても壊れないように丸める。
 * 0 は inv_movements の CHECK(qty <> 0) に弾かれるので、呼び出し側で先に止めること。
 */
export function signedQty(kind: MovementKind, qty: number): number {
  const abs = Math.abs(Math.trunc(Number(qty) || 0));
  return OUTBOUND_KINDS.includes(kind) ? -abs : abs;
}

/** 理論在庫＝直近の確定棚卸の数量 ＋ その棚卸日より後の入出庫。inv_stock ビューと同じ定義 */
export function theoreticalQty(baseQty: number | null, deltaSince: number | null): number {
  return (baseQty ?? 0) + (deltaSince ?? 0);
}

/** 適正在庫を割っているか。reorder_point 未設定なら判定しない（false） */
export function needsReorder(qty: number, reorderPoint: number | null): boolean {
  return reorderPoint != null && qty <= reorderPoint;
}

/** 売上原価（三分法）。期首が無い＝前月の棚卸が無い月は計算しない */
export function cogs(opening: number | null, purchase: number, closing: number): number | null {
  if (opening == null) return null;
  return opening + purchase - closing;
}

export const yen = (n: number | null | undefined) =>
  n == null ? "—" : `¥${Math.round(n).toLocaleString("ja-JP")}`;

export const NO_LOCATION = "（保管場所 未設定）";

/**
 * 保管場所でグルーピング。棚卸は「場所ごとに歩いて数える」ので、これが画面の基本単位になる。
 * 品番数の多い場所を先に、未設定は最後に置く。
 */
export function groupByLocation<T extends { location1: string | null }>(
  rows: T[]
): Array<{ location: string; rows: T[] }> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = r.location1 ?? NO_LOCATION;
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return [...m.entries()]
    .map(([location, rows]) => ({ location, rows }))
    .sort((a, b) => {
      if (a.location === NO_LOCATION) return 1;
      if (b.location === NO_LOCATION) return -1;
      return b.rows.length - a.rows.length;
    });
}
