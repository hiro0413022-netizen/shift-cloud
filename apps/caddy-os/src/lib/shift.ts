/* ============================================================
   シフトの型と表示ラベル（クライアント/サーバー共用）

   `lib/caddy.ts` は "server-only" なので、クライアントコンポーネント（カレンダー等）から
   参照する型・定数はここに置く。caddy.ts からも re-export しているので、
   サーバー側は今までどおり "@/lib/caddy" だけを見ればよい。
   ============================================================ */

export type DispatchStatus = "tentative" | "confirmed" | "cancelled";
export type AvailabilityStatus = "available" | "maybe" | "unavailable";

export const STATUS_LABEL: Record<DispatchStatus, string> = {
  tentative: "仮",
  confirmed: "確定",
  cancelled: "取消",
};

export const STATUS_TONE: Record<DispatchStatus, string> = {
  tentative: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-100 text-slate-400 line-through",
};

/** 勤務区分の表示名（台帳・CSV共通） */
export function kindLabel(kind: string): string {
  return { dispatch: "派遣", training: "研修", golfwing: "GW勤務", other: "その他" }[kind] ?? kind;
}

/**
 * 金額集計の対象は「確定」だけ（migration 0118 / refresh_caddy_finance と同じ条件）。
 * 仮組み・キャンセルが売上や外注費に混ざると、Genesisの事業別PLと数字がズレる。
 */
export function isBillable(r: { status?: DispatchStatus | string | null }): boolean {
  return (r.status ?? "confirmed") === "confirmed";
}

export type BoardDispatch = {
  id: string;
  dispatch_date: string;
  status: DispatchStatus;
  kind: string;
  client_id: string | null;
  client_name: string | null;
  partner_id: string | null;
  staff_id: string | null;
  caddie_name: string;
  sales_amount: number;
  fee_amount: number;
  transport_amount: number;
  special_amount: number;
  memo: string | null;
};

export type BoardAvailability = {
  partner_id: string;
  date: string;
  status: AvailabilityStatus;
  memo: string | null;
  source: string;
};

export type MonthBoard = {
  ym: string;
  days: string[];
  dispatches: BoardDispatch[];
  availability: BoardAvailability[];
};
