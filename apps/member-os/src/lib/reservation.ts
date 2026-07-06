// 予約システム（姫路 FRUNK GOLF）共通ロジック

export const SLOT_MINUTES = 60;
export const HIMEJI_STORE_CODE = "frunk_himeji";

/** "HH:MM" → 分 */
export function toMin(t: string): number {
  const [h, m] = t.slice(0, 5).split(":").map((x) => parseInt(x, 10));
  return h * 60 + (m || 0);
}
/** 分 → "HH:MM" */
export function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 営業時間から予約枠の開始時刻リストを生成 */
export function genSlots(openTime: string | null, closeTime: string | null, step = SLOT_MINUTES): string[] {
  const open = toMin(openTime ?? "10:00");
  const close = toMin(closeTime ?? "22:00");
  const out: string[] = [];
  for (let t = open; t + step <= close; t += step) out.push(toHHMM(t));
  return out;
}

export function slotEnd(start: string, step = SLOT_MINUTES): string {
  return toHHMM(toMin(start) + step);
}

export const CUSTOMER_KIND = [
  { value: "member", label: "会員" },
  { value: "dropin", label: "都度利用" },
] as const;

export const BOOKING_STATUS_LABEL: Record<string, string> = {
  reserved: "予約", visited: "来店", canceled: "キャンセル", no_show: "無断欠",
};
