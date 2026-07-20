// 体験申込（公開Web・mbr_trial_requests）共通ロジック

export const TRIAL_STATUSES = [
  { value: "pending", label: "未対応", tone: "warn" as const },
  { value: "confirmed", label: "日程確定", tone: "ok" as const },
  { value: "done", label: "来店済", tone: "default" as const },
  { value: "canceled", label: "キャンセル", tone: "danger" as const },
];
export const TRIAL_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  TRIAL_STATUSES.map((s) => [s.value, s.label])
);
export const TRIAL_STATUS_TONE: Record<string, "default" | "ok" | "warn" | "danger"> =
  Object.fromEntries(TRIAL_STATUSES.map((s) => [s.value, s.tone])) as Record<
    string,
    "default" | "ok" | "warn" | "danger"
  >;

export const TRIAL_EXPERIENCE = [
  "未経験・これから始めたい",
  "初心者（100切りを目指したい）",
  "中級者",
  "上級者・シングル",
] as const;
