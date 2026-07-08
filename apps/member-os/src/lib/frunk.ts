// FRUNK GOLF 姫路 会員制度の選択肢・ラベル（Smart Hello外・member-os管理）

export const FRUNK_STORE_CODE = "frunk_himeji";

export const FRUNK_PAYMENT_METHODS = [
  { value: "cash", label: "現金" },
  { value: "credit", label: "クレジットカード" },
  { value: "bank", label: "口座振替" },
  { value: "sb_payment", label: "SBペイメント" },
  { value: "other", label: "その他" },
] as const;
export const FRUNK_PAYMENT_LABEL: Record<string, string> = Object.fromEntries(
  FRUNK_PAYMENT_METHODS.map((p) => [p.value, p.label])
);

export const FRUNK_STATUSES = [
  { value: "pending", label: "申込", tone: "warn" as const },
  { value: "active", label: "在籍", tone: "ok" as const },
  { value: "suspended", label: "休会", tone: "default" as const },
  { value: "left", label: "退会", tone: "danger" as const },
  { value: "rejected", label: "却下", tone: "default" as const },
];
export const FRUNK_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  FRUNK_STATUSES.map((s) => [s.value, s.label])
);
export const FRUNK_STATUS_TONE: Record<string, "default" | "ok" | "warn" | "danger"> = Object.fromEntries(
  FRUNK_STATUSES.map((s) => [s.value, s.tone])
) as Record<string, "default" | "ok" | "warn" | "danger">;

export function yen(n: number | null | undefined): string {
  return n == null ? "—" : `¥${Number(n).toLocaleString("ja-JP")}`;
}
