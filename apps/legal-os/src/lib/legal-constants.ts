// クライアント/サーバー両用の定数（server-onlyを含まないこと）

export const DOC_TYPES = ["contract", "agreement", "terms", "nda", "other"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<string, string> = {
  contract: "契約書",
  agreement: "覚書・MOU",
  terms: "規約",
  nda: "NDA",
  other: "その他",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "下書き",
  under_review: "AIレビュー中",
  pending_approval: "承認待ち",
  active: "有効",
  expired: "満了",
  terminated: "解約済",
  archived: "アーカイブ",
};

export const RISK_LABELS: Record<string, string> = {
  low: "低",
  medium: "中",
  high: "高",
};
