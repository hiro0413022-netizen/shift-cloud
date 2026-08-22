// JST日付ルール（DECISIONS #73）: サーバーで「今日」を作るときはUTC禁止・必ずJSTで。
export function todayJst(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date()); // YYYY-MM-DD
}

export function fmtDateJa(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${y}.${m}.${d}`;
}

/** 2026-08-28〜2026-08-31 → 2026.08.28-08.31 の大会期間表記 */
export function fmtSpanJa(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return "";
  if (!end || end === start) return fmtDateJa(start);
  const [, m2, d2] = end.split("-");
  return `${fmtDateJa(start)}-${m2}.${d2}`;
}
