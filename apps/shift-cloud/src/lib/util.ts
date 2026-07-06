const TZ = "Asia/Tokyo";

/** 今日の日付（JST, YYYY-MM-DD） */
export function todayJST(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date());
}

/** timestamptz→JSTのYYYY-MM-DD */
export function dateJST(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date(iso));
}

/** timestamptz→JSTのHH:MM */
export function timeJST(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}

/** 月初日付文字列 "2026-07-01" */
export function monthStart(ym: string): string {
  return `${ym}-01`;
}

/** "2026-07" → その月の日付配列 */
export function daysOfMonth(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
}

/** "2026-07-01".."2026-07-15" → 期間内の日付配列（両端含む） */
export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const e = new Date(end + "T00:00:00+09:00");
  for (let d = new Date(start + "T00:00:00+09:00"); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d));
  }
  return out;
}

/** "2026-07-15" → "7月15日（火）" */
export function fmtDateJP(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${Number(m)}月${Number(d)}日（${dowJP(dateStr)}）`;
}

/** 月の前半(1-15)/後半(16-末)の範囲を返す */
export function halfMonthRange(ym: string, half: 1 | 2): { start: string; end: string } {
  const [y, m] = ym.split("-").map(Number);
  if (half === 1) return { start: `${ym}-01`, end: `${ym}-15` };
  const last = new Date(y, m, 0).getDate();
  return { start: `${ym}-16`, end: `${ym}-${String(last).padStart(2, "0")}` };
}

export function currentYM(): string {
  return todayJST().slice(0, 7);
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const DOW = ["日", "月", "火", "水", "木", "金", "土"];
export function dowJP(dateStr: string): string {
  return DOW[new Date(dateStr + "T00:00:00+09:00").getDay()];
}

/** "HH:MM:SS" or "HH:MM" → "HH:MM" */
export function hm(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

export function yen(n: number): string {
  return "¥" + n.toLocaleString("ja-JP");
}

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

/** シフトのdate+time(HH:MM) をJSTのDateに */
export function jstDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time.slice(0, 5)}:00+09:00`);
}
