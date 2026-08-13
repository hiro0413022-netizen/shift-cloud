/**
 * シフト作成画面の「表示する期間」の算出（純関数・DBアクセス禁止）。
 *
 * 【なぜこのファイルがあるか / DECISIONS #135】
 * シフト作成が月固定で、31列が横スクロールし続けて調整しづらかった。
 * Airシフトと同じ「日 / 週 / 半月 / 月」の切替を入れるにあたり、
 * 日付の範囲計算を画面ごとに書くと必ずズレる（#132 で shift-scope.ts に
 * 集約したのと同じ理由）。**期間の解釈はここ1本に集約する。**
 *
 * 決めごと:
 *   - 週の開始は月曜（mondayOf）
 *   - 半月は 1〜15 / 16〜末日。印刷画面(print/page.tsx)の half1/half2 と同じ区切り
 *   - 「今日」はサーバーでは UTC で出さない（[[jst-date-rule]]）。todayJST() を使う
 */

import { addDays, eachDate } from "./shift-scope.ts";
import { addMonths, dowJP, halfMonthRange, mondayOf, todayJST } from "./util.ts";

export const SPAN_KINDS = ["day", "week", "half", "month"] as const;
export type SpanKind = (typeof SPAN_KINDS)[number];

/** タブの表示名 */
export const SPAN_LABELS: Record<SpanKind, string> = {
  day: "日",
  week: "週",
  half: "半月",
  month: "月",
};

export type ResolvedSpan = {
  span: SpanKind;
  /** 正規化された基準日＝期間の初日。URLの ?d= はこれを入れる */
  base: string;
  start: string;
  end: string;
  /** start〜end の日付配列（両端含む） */
  days: string[];
  /** 基準日の年月 "2026-09"（募集期間フォームなど「月」単位のUI用） */
  ym: string;
  /** 見出し用「2026年9月1日（火） 〜 9月15日（火）」 */
  label: string;
  /** ボタン用の短いラベル「9月前半」「9/1〜9/7」など */
  shortLabel: string;
  /** ← / → の遷移先（基準日） */
  prev: string;
  next: string;
  /** 紙シフト出力(print/page.tsx)へ引き継ぐ range */
  printRange: "half1" | "half2" | "month" | "custom";
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const YM_RE = /^\d{4}-\d{2}$/;

/** "2026-09-31" のような存在しない日付を弾く（URLは手で書き換えられる） */
function normalizeDate(s?: string | null): string | null {
  if (!s || !DATE_RE.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return s;
}

/** ?span= の値を SpanKind に。未知の値は month（今までの挙動） */
export function parseSpan(v?: string | null): SpanKind {
  return (SPAN_KINDS as readonly string[]).includes(v ?? "") ? (v as SpanKind) : "month";
}

/** その月の末日（1〜31） */
function lastDayOf(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function p2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "2026-09-01"（火） → "2026年9月1日（火）" */
function jpFull(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}年${m}月${d}日（${dowJP(date)}）`;
}
/** "2026-09-15" → "9月15日（火）" */
function jpMD(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}月${d}日（${dowJP(date)}）`;
}
/** "2026-09-15" → "9/15" */
function slashMD(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}`;
}

/**
 * 表示する期間を決める。
 *
 * 基準日の決め方（1本のルール）:
 *   ① ?d=YYYY-MM-DD があればそれ
 *   ② なければ ?ym=YYYY-MM の1日（旧URLとの互換）
 *   ③ どちらも無ければ「翌月の1日」＝今までの既定
 * span の既定は month なので、パラメータ無しなら従来どおり「翌月・1ヶ月」になる。
 */
export function resolveSpan(input: {
  span?: string | null;
  d?: string | null;
  ym?: string | null;
  /** JSTの今日 "YYYY-MM-DD"。省略時は todayJST()（テストでは必ず渡す） */
  today?: string;
} = {}): ResolvedSpan {
  const span = parseSpan(input.span);
  const today = normalizeDate(input.today) ?? todayJST();

  const fromD = normalizeDate(input.d);
  const fromYM = !fromD && input.ym && YM_RE.test(input.ym) ? `${input.ym}-01` : null;
  const anchor = fromD ?? fromYM ?? `${addMonths(today.slice(0, 7), 1)}-01`;

  const ym = anchor.slice(0, 7);
  const day = Number(anchor.slice(8));

  let start: string;
  let end: string;
  let prev: string;
  let next: string;
  let printRange: ResolvedSpan["printRange"];
  let label: string;
  let shortLabel: string;

  if (span === "day") {
    start = anchor;
    end = anchor;
    prev = addDays(anchor, -1);
    next = addDays(anchor, 1);
    printRange = "custom";
    label = jpFull(start);
    shortLabel = `${slashMD(start)}（${dowJP(start)}）`;
  } else if (span === "week") {
    start = mondayOf(anchor);
    end = addDays(start, 6);
    prev = addDays(start, -7);
    next = addDays(start, 7);
    printRange = "custom";
    label = `${jpFull(start)} 〜 ${start.slice(0, 4) === end.slice(0, 4) ? jpMD(end) : jpFull(end)}`;
    shortLabel = `${slashMD(start)}〜${slashMD(end)}`;
  } else if (span === "half") {
    const half: 1 | 2 = day <= 15 ? 1 : 2;
    ({ start, end } = halfMonthRange(ym, half));
    prev = half === 1 ? `${addMonths(ym, -1)}-16` : `${ym}-01`;
    next = half === 1 ? `${ym}-16` : `${addMonths(ym, 1)}-01`;
    printRange = half === 1 ? "half1" : "half2";
    label = `${jpFull(start)} 〜 ${jpMD(end)}`;
    shortLabel = `${Number(ym.slice(5))}月${half === 1 ? "前半" : "後半"}`;
  } else {
    start = `${ym}-01`;
    end = `${ym}-${p2(lastDayOf(ym))}`;
    prev = `${addMonths(ym, -1)}-01`;
    next = `${addMonths(ym, 1)}-01`;
    printRange = "month";
    label = `${Number(ym.slice(0, 4))}年${Number(ym.slice(5))}月`;
    shortLabel = `${Number(ym.slice(5))}月`;
  }

  return {
    span,
    base: start,
    start,
    end,
    days: eachDate(start, end),
    ym: start.slice(0, 7),
    label,
    shortLabel,
    prev,
    next,
    printRange,
  };
}

/**
 * 期間がまたぐ月の「月初」一覧。
 * 募集期間(shift_request_periods)は target_month で持っているので、
 * 週表示が月をまたぐときに片方の月の募集が消えないようにするために使う。
 */
export function monthsCovered(start: string, end: string): string[] {
  const out: string[] = [];
  let ym = start.slice(0, 7);
  const last = end.slice(0, 7);
  for (let i = 0; i < 24 && ym <= last; i++) {
    out.push(`${ym}-01`);
    ym = addMonths(ym, 1);
  }
  return out;
}

/** シフト作成画面のURL。日付計算と同じく組み立ても1か所に寄せる */
export function shiftsHref(storeId: string, span: SpanKind, d: string): string {
  return `/admin/shifts?store=${storeId}&span=${span}&d=${d}`;
}

/** 紙シフト出力のURL。半月/月はrange、日/週はcustomで開始終了を渡す */
export function printHref(storeId: string, r: ResolvedSpan): string {
  const base = `/admin/shifts/print?store=${storeId}&ym=${r.ym}&range=${r.printRange}`;
  return r.printRange === "custom" ? `${base}&start=${r.start}&end=${r.end}` : base;
}
