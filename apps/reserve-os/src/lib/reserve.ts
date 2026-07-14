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

/* ============================================================
   受付可能な曜日・時間帯（DECISIONS #58）
   ルールはDB(res_services)が正。ここは「選択肢を作る」「検証する」だけの純関数。
   クライアント（選択肢生成）とサーバー（改ざん検証）の両方から使う。
   ============================================================ */

export type BookingHours = {
  closedWeekdays: number[];   // 0=日 1=月 2=火 …
  openTime: string;           // "11:00"
  closeTime: string;          // "18:00"
  slotStepMin: number;        // 30
  windowDays: number;         // 60
  minLeadDays: number;        // 1 = 翌日以降
};

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

/** "HH:MM" or "HH:MM:SS" → 分 */
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return parseInt(h, 10) * 60 + parseInt(m ?? "0", 10);
}
function fromMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 今日(JST)の YYYY-MM-DD */
export function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: JST, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** 選択できる日付の一覧（定休日を除外・minLeadDays後から windowDays 先まで） */
export function bookableDates(h: BookingHours, from: string = todayJST()): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const base = new Date(`${from}T00:00:00+09:00`);
  for (let i = h.minLeadDays; i <= h.windowDays; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    // 日付の判定は必ずJSTで行う（UTCのgetDay()だと日付境界がずれる）
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: JST, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const dow = new Date(`${ymd}T00:00:00+09:00`).getUTCDay(); // +09:00指定なのでUTC曜日=JST曜日
    if (h.closedWeekdays.includes(dow)) continue;
    const [, mm, dd] = ymd.split("-");
    out.push({ value: ymd, label: `${Number(mm)}月${Number(dd)}日(${DOW[dow]})` });
  }
  return out;
}

/** 選択できる開始時刻（所要時間ぶん営業時間内に収まるものだけ） */
export function bookableTimes(h: BookingHours, durationMin: number | null): string[] {
  const start = toMin(h.openTime);
  const end = toMin(h.closeTime);
  const last = end - (durationMin && durationMin > 0 ? durationMin : 0);
  const out: string[] = [];
  for (let t = start; t <= last; t += h.slotStepMin) out.push(fromMin(t));
  return out;
}

/** サーバー側の検証（フォームを迂回した送信を弾く） */
export function isBookable(h: BookingHours, ymd: string, hm: string, durationMin: number | null): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !/^\d{2}:\d{2}$/.test(hm)) return false;
  const dow = new Date(`${ymd}T00:00:00+09:00`).getUTCDay();
  if (h.closedWeekdays.includes(dow)) return false;
  if (!bookableDates(h).some((d) => d.value === ymd)) return false;
  return bookableTimes(h, durationMin).includes(hm);
}

/** 営業時間の人が読む表記（注意事項・FAQ用） */
export function hoursText(h: BookingHours): string {
  const closed = h.closedWeekdays.map((d) => `${DOW[d]}曜`).join("・");
  return `${h.openTime}〜${h.closeTime}${closed ? `（${closed}定休）` : ""}`;
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
