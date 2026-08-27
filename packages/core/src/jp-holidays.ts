/**
 * 日本の祝日（FRANK GOLF の営業時間判定に使う）
 *
 * ★ なぜ作ったか
 *   FRANK GOLF は「平日 10:00〜22:00 / 土日祝 9:00〜20:00」。
 *   祝日は gn_site_content の booking.holiday_dates に手で並べていたが、
 *   並べた日付が切れた月から祝日が平日扱いになる（＝9時開店の枠が出ない）。
 *   毎年の手入れを無くすため、祝日を計算で出す。
 *
 * ★ 計算できる範囲
 *   1980〜2099年。春分・秋分は国立天文台の近似式（この範囲で実用上一致する）。
 *   法改正・臨時の祝日（例: 即位の礼）は計算では出ないので、
 *   その年だけ booking.holiday_dates に手で足す。手入力は「追加」として常に効く。
 */

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
/** 曜日 0=日〜6=土。日付文字列だけを見るのでUTCで判定してよい */
const dowOf = (s: string) => new Date(`${s}T00:00:00Z`).getUTCDay();
const shift = (s: string, days: number) =>
  new Date(new Date(`${s}T00:00:00Z`).getTime() + days * 86400_000).toISOString().slice(0, 10);

/** その月の第n月曜（ハッピーマンデー） */
function nthMonday(y: number, m: number, nth: number): string {
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=日
  const firstMonday = 1 + ((8 - firstDow) % 7);
  return ymd(y, m, firstMonday + (nth - 1) * 7);
}

/** 春分の日・秋分の日（1980〜2099の近似式） */
const vernalDay = (y: number) => Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
const autumnDay = (y: number) => Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

/** 国民の祝日（振替休日・国民の休日を含まない素の祝日） */
function baseHolidays(y: number): Map<string, string> {
  const h = new Map<string, string>();
  h.set(ymd(y, 1, 1), "元日");
  h.set(nthMonday(y, 1, 2), "成人の日");
  h.set(ymd(y, 2, 11), "建国記念の日");
  h.set(ymd(y, 2, 23), "天皇誕生日");
  h.set(ymd(y, 3, vernalDay(y)), "春分の日");
  h.set(ymd(y, 4, 29), "昭和の日");
  h.set(ymd(y, 5, 3), "憲法記念日");
  h.set(ymd(y, 5, 4), "みどりの日");
  h.set(ymd(y, 5, 5), "こどもの日");
  h.set(nthMonday(y, 7, 3), "海の日");
  h.set(ymd(y, 8, 11), "山の日");
  h.set(nthMonday(y, 9, 3), "敬老の日");
  h.set(ymd(y, 9, autumnDay(y)), "秋分の日");
  h.set(nthMonday(y, 10, 2), "スポーツの日");
  h.set(ymd(y, 11, 3), "文化の日");
  h.set(ymd(y, 11, 23), "勤労感謝の日");
  return h;
}

const cache = new Map<number, Map<string, string>>();

/** その年の祝日すべて（振替休日・国民の休日を含む）。キー=YYYY-MM-DD、値=名称 */
export function jpHolidays(year: number): Map<string, string> {
  const hit = cache.get(year);
  if (hit) return hit;

  const base = baseHolidays(year);
  const all = new Map(base);

  // 国民の休日：祝日と祝日に挟まれた平日（例 2026-09-22）
  for (const d of Array.from(base.keys())) {
    const next2 = shift(d, 2);
    if (!base.has(next2)) continue;
    const mid = shift(d, 1);
    if (base.has(mid) || dowOf(mid) === 0) continue;
    all.set(mid, "国民の休日");
  }

  // 振替休日：日曜と重なった祝日の、次の「祝日でない日」
  for (const d of Array.from(base.keys())) {
    if (dowOf(d) !== 0) continue;
    let t = shift(d, 1);
    while (all.has(t)) t = shift(t, 1);
    all.set(t, "振替休日");
  }

  cache.set(year, all);
  return all;
}

/** 祝日か（振替休日・国民の休日を含む） */
export function isJpHoliday(dateStr: string): boolean {
  const y = Number(dateStr.slice(0, 4));
  if (!Number.isFinite(y) || y < 1980 || y > 2099) return false;
  return jpHolidays(y).has(dateStr);
}

/** 祝日の名称。祝日でなければ null */
export function jpHolidayName(dateStr: string): string | null {
  const y = Number(dateStr.slice(0, 4));
  if (!Number.isFinite(y) || y < 1980 || y > 2099) return null;
  return jpHolidays(y).get(dateStr) ?? null;
}
