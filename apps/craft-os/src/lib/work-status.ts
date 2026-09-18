/**
 * 工房（注文書）の状態は、進み具合の日付から決める（手で選ばせない＝画面と実態がずれない）。
 *
 * 2026-09-18 変更: 以前は「お支払い日が入った＝完了」だった。
 *   ユーザーの運用は「注文書を印刷 → その場でお支払い → 発注」なので、先にお支払いが入ると
 *   まだ発注もしていないのに「完了」になってしまう。完了は「お渡し済み かつ お支払い済み」に限る。
 */
export type WorkDates = {
  ordered_on?: string | null;
  arrived_on?: string | null;
  assembled_on?: string | null;
  delivered_on?: string | null;
  paid_on?: string | null;
};

export function workStatusOf(w: WorkDates): string {
  if (w.delivered_on && w.paid_on) return "closed";
  if (w.delivered_on) return "delivered";
  if (w.assembled_on) return "ready";
  if (w.arrived_on) return "arrived";
  if (w.ordered_on) return "ordered";
  return "open";
}

/** 日本時間の今日（YYYY-MM-DD）。サーバーは UTC で動くので new Date() の日付をそのまま使わない */
export function todayJst(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/**
 * 注文書の日付欄（紙と同じ「9／18」）に打たれた文字を日付にする。
 *   "9/18" "9／18" "0918"(4桁) "2026-09-18" "2026/9/18" "今日" を受ける。空や読めないものは null。
 *   年が無いときは今年。ただし今日より半年以上先になるなら去年とみなす（年明けに前年分を打つとき）。
 */
export function parseDay(raw: string | null | undefined, today = todayJst()): string | null {
  const s = String(raw ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[／.]/g, "/");
  if (!s || s === "/") return null;
  if (s === "今日" || s.toLowerCase() === "today") return today;
  const pad = (n: number) => String(n).padStart(2, "0");
  const ok = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
  };
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return ok(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})$/) ?? s.match(/^(\d{2})(\d{2})$/);
  if (!m) return null;
  const ty = Number(today.slice(0, 4));
  const cand = ok(ty, Number(m[1]), Number(m[2]));
  if (!cand) return null;
  const diffDays = (Date.parse(cand) - Date.parse(today)) / 86400000;
  return diffDays > 183 ? ok(ty - 1, Number(m[1]), Number(m[2])) : cand;
}
