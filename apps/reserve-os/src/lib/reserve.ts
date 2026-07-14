/** Reserve OS 共通の表示ラベル・整形ヘルパー（サーバー/クライアント両用） */

export const STATUS_LABEL: Record<string, string> = {
  pending: "確認待ち",
  confirmed: "確定",
  declined: "見送り",
  canceled: "キャンセル",
  completed: "完了",
};

export const STATUS_TONE: Record<string, "warn" | "ok" | "danger" | "default"> = {
  pending: "warn",
  confirmed: "ok",
  declined: "danger",
  canceled: "default",
  completed: "ok",
};

export const HANDEDNESS_LABEL: Record<string, string> = {
  right: "右打ち",
  left: "左打ち",
};

export const CATEGORY_LABEL: Record<string, string> = {
  shaft_fitting: "シャフトフィッティング",
  club_fitting: "クラブフィッティング",
  trial_lesson: "体験レッスン",
  other: "その他",
};

const JST = "Asia/Tokyo";

/** timestamptz(ISO) → "2026年7月20日(月) 14:00"（JST） */
export function fmtJst(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("ja-JP", {
    timeZone: JST, year: "numeric", month: "long", day: "numeric", weekday: "short",
  });
  const time = d.toLocaleTimeString("ja-JP", {
    timeZone: JST, hour: "2-digit", minute: "2-digit",
  });
  return `${date} ${time}`;
}

/** timestamptz(ISO) → "7/20 14:00"（一覧向けの短縮, JST） */
export function fmtJstShort(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ja-JP", {
    timeZone: JST, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", weekday: "short",
  });
}

/** 受付番号の表示（例: R-0007） */
export function fmtSeq(seq: number | string | null | undefined): string {
  if (seq == null) return "R-—";
  return `R-${String(seq).padStart(4, "0")}`;
}

/** ローカル datetime-local 文字列(JST) → ISO(UTC)。ブラウザTZに依存しないようJST固定で解釈。 */
export function jstLocalToISO(local: string): string | null {
  // local: "YYYY-MM-DDTHH:MM"
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  // JST(+09:00)として絶対時刻を確定
  const iso = `${y}-${mo}-${d}T${h}:${mi}:00+09:00`;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

/** 予約1件の可読な希望日時リスト */
export function preferredList(r: {
  pref1_at?: string | null; pref2_at?: string | null; pref3_at?: string | null;
}): string[] {
  return [r.pref1_at, r.pref2_at, r.pref3_at]
    .filter((v): v is string => !!v)
    .map((v) => fmtJst(v));
}

/** ヒアリング項目のラベル（詳細表示・メール・CSVで共用） */
export const INTAKE_FIELDS: { key: string; label: string }[] = [
  { key: "plan_name", label: "ご希望メニュー" },
  { key: "name", label: "氏名" },
  { key: "name_kana", label: "ふりがな" },
  { key: "phone", label: "電話番号" },
  { key: "email", label: "メール" },
  { key: "handedness", label: "利き手" },
  { key: "age", label: "年齢" },
  { key: "avg_score", label: "平均スコア" },
  { key: "head_speed", label: "ヘッドスピード" },
  { key: "golf_experience", label: "ゴルフ歴" },
  { key: "club_maker", label: "使用クラブ メーカー" },
  { key: "club_model", label: "使用クラブ モデル" },
  { key: "club_shaft", label: "シャフト名" },
  { key: "club_flex", label: "フレックス" },
  { key: "concern", label: "現在の悩み" },
  { key: "improvement", label: "改善したいこと" },
  { key: "target_distance", label: "飛距離" },
  { key: "bring_clubs", label: "持ち込み予定クラブ" },
  { key: "other_notes", label: "その他相談" },
];
