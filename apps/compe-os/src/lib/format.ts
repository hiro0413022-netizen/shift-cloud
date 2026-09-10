/** 表示フォーマット（画面と印刷で同じ見た目にするため1か所に置く） */

export function dateJa(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(`${d}T00:00:00+09:00`);
  return dt.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export function dateShort(d: string | null | undefined): string {
  if (!d) return "—";
  return d.replace(/-/g, "/");
}

export function yen(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toLocaleString("ja-JP")}円`;
}

/** timestamptz → JSTの「HH:mm」 */
export function timeJst(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}
