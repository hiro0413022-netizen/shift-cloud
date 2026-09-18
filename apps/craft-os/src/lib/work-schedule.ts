/**
 * 工房の段取り（発注 → 入荷 → 組立 → お渡し連絡）の日付を出す。純関数（テスト対象）。
 *
 * 2026-09-19 ユーザーの説明（GOLF WING 宝塚）:
 *   ・メーカーの発送は平日だけ。土日に発注したものは月曜発送
 *   ・発送の翌日（夕方）に届くことが多い
 *   ・火曜は定休日。火曜着になるものは水曜着とみなす
 *   ・届いたら工房作業を始める
 * 祝日・メーカーの長期休暇は見ていない（その週は手で日付を直す）。
 */

export const STORE_CLOSED_DOW = [2]; // 0=日 … 2=火

const pad = (n: number) => String(n).padStart(2, "0");
const toYmd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
export const addDays = (ymd: string, n: number) => {
  const d = parse(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return toYmd(d);
};
export const dowOf = (ymd: string) => parse(ymd).getUTCDay();
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
export const mdw = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}(${WEEK[dowOf(ymd)]})`;

/** 店が開いている日まで進める（その日が開いていればその日） */
export function nextOpenDay(ymd: string, closed = STORE_CLOSED_DOW): string {
  let d = ymd;
  for (let i = 0; i < 7 && closed.includes(dowOf(d)); i++) d = addDays(d, 1);
  return d;
}

/** メーカーの発送日: 平日はその日、土日は次の月曜 */
export function shipDate(orderYmd: string): string {
  const w = dowOf(orderYmd);
  if (w === 6) return addDays(orderYmd, 2);
  if (w === 0) return addDays(orderYmd, 1);
  return orderYmd;
}

/** 到着予定（夕方）: 発送の翌日。定休日なら次の営業日 */
export function arrivalDate(orderYmd: string, closed = STORE_CLOSED_DOW): string {
  return nextOpenDay(addDays(shipDate(orderYmd), 1), closed);
}

export type WorkPlanStep = { key: "order" | "arrive" | "assemble" | "contact"; date: string; label: string; note: string };

/**
 * 段取りの一覧。
 *   発注     … 発注日（まだなら今日）
 *   入荷確認 … 到着予定日（夕方着）
 *   組立     … 到着日（夕方着なので、その日の夕方〜）
 *   お渡し連絡 … 組立の翌営業日（仕上げ期日が決まっていればその日）
 */
export function planWork(opts: { orderYmd: string; dueYmd?: string | null; closed?: number[] }): WorkPlanStep[] {
  const closed = opts.closed ?? STORE_CLOSED_DOW;
  const order = opts.orderYmd;
  const ship = shipDate(order);
  const arrive = arrivalDate(order, closed);
  const contact = opts.dueYmd && opts.dueYmd >= arrive ? opts.dueYmd : nextOpenDay(addDays(arrive, 1), closed);
  const shipNote = ship === order ? `メーカー発送 ${mdw(ship)}` : `土日の発注はメーカー発送が ${mdw(ship)}`;
  const rawArrive = addDays(ship, 1);
  const arriveNote = rawArrive === arrive ? "翌日夕方着の見込み" : `${mdw(rawArrive)}着の予定が定休日のため ${mdw(arrive)}`;
  return [
    { key: "order", date: order, label: "シャフト発注", note: shipNote },
    { key: "arrive", date: arrive, label: "入荷確認（夕方着予定）", note: arriveNote },
    { key: "assemble", date: arrive, label: "組立", note: "届いたら組み立て（組立指示書）" },
    { key: "contact", date: contact, label: "お渡しのご連絡", note: opts.dueYmd ? "仕上げ期日" : "組立の翌営業日" },
  ];
}
