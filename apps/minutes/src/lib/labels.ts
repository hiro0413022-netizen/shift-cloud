export const STATUS_LABEL: Record<string, { text: string; tone: "dim" | "ok" | "warn" | "danger" | "accent" }> = {
  draft: { text: "未取り込み", tone: "dim" },
  recording: { text: "録音中", tone: "danger" },
  transcribing: { text: "文字起こし中", tone: "accent" },
  transcribed: { text: "要約待ち", tone: "accent" },
  summarizing: { text: "要約中", tone: "accent" },
  summarized: { text: "確認待ち", tone: "warn" },
  confirmed: { text: "確定", tone: "ok" },
  failed: { text: "失敗", tone: "danger" },
};

export const SOURCE_LABEL: Record<string, string> = {
  record: "その場で録音",
  file: "音声ファイル",
  text: "文字起こしの貼り付け",
};
