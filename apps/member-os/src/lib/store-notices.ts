import "server-only";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * その日の連絡事項（申し送り）— #215
 *
 * ユーザー依頼:「当日の連絡事項みたいなメモが欲しい、表やカレンダーにマークが出るような感じで、
 *                あとそれを朝のラインに流せるように」
 *
 * ★ 1日だけ／期間、どちらも同じ表（date_from = date_to なら1日だけ）。
 * ★ store_id が null は全店共通。店舗の画面にも出る。
 * ★ 朝6時のLINE（Genesis の ceo-ai）も同じ表を読む＝画面と朝の連絡が食い違わない。
 */

export type Notice = {
  id: string;
  store_id: string | null;
  date_from: string;
  date_to: string;
  body: string;
  level: "info" | "warn";
  created_at: string;
};

const COLS = "id, store_id, date_from, date_to, body, level, created_at";

/** その日に出す連絡（店舗ぶん＋全店共通）。重要（warn）を先に、次に登録順 */
export async function loadNoticesFor(companyId: string, storeId: string, dateStr: string): Promise<Notice[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("store_notices")
    .select(COLS)
    .eq("company_id", companyId)
    .lte("date_from", dateStr)
    .gte("date_to", dateStr)
    .is("deleted_at", null)
    .or(`store_id.eq.${storeId},store_id.is.null`)
    .order("level", { ascending: false }) // warn → info
    .order("created_at", { ascending: true })
    .limit(50);
  return (data ?? []) as Notice[];
}

/**
 * その月にマークを出す日（カレンダー用）。
 * 期間の連絡は「その期間の日すべて」にマークが要るので、行を日付に展開する。
 */
export async function loadNoticeDays(companyId: string, storeId: string, month: string): Promise<Set<string>> {
  const admin = createAdmin();
  const first = `${month}-01`;
  const last = monthLastDay(month);
  const { data } = await admin
    .from("store_notices")
    .select("date_from, date_to, store_id")
    .eq("company_id", companyId)
    .lte("date_from", last)
    .gte("date_to", first)
    .is("deleted_at", null)
    .or(`store_id.eq.${storeId},store_id.is.null`)
    .limit(200);

  const days = new Set<string>();
  for (const r of (data ?? []) as { date_from: string; date_to: string }[]) {
    let d = r.date_from > first ? r.date_from : first;
    const end = r.date_to < last ? r.date_to : last;
    let guard = 0;
    while (d <= end && guard++ < 62) {
      days.add(d);
      d = addDay(d);
    }
  }
  return days;
}

/** 「9/4」「9/4〜9/8」。1日だけの連絡と期間の連絡を見分けられるように */
export function noticeRangeLabel(n: { date_from: string; date_to: string }): string {
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return n.date_from === n.date_to ? md(n.date_from) : `${md(n.date_from)}〜${md(n.date_to)}`;
}

function addDay(ymd: string): string {
  const t = new Date(`${ymd}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

function monthLastDay(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const t = new Date(Date.UTC(y, m, 0)); // m は1始まり → 0日目＝前月末＝当月末
  return t.toISOString().slice(0, 10);
}
