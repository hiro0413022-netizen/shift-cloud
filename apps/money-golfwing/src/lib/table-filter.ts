/**
 * 一覧の「探す・絞る・集計する」の共通ロジック（純関数）。
 *
 * Excelの表でやっていたこと（オートフィルタ・Ctrl+F・ピボット）を
 * 売上/現金出納/証憑の3画面で同じ挙動にするため、ここに集約する。
 */

/**
 * 検索用に文字をそろえる。
 * 全角英数・全角スペース・カタカナの濁点などを NFKC で統一し、小文字化する。
 * 「ＴＩＴＬＥＩＳＴ」でも「titleist」でも同じものが引けるようにするため。
 */
export function normalizeText(s: unknown): string {
  if (s == null) return "";
  return String(s).normalize("NFKC").toLowerCase().trim();
}

/**
 * キーワード検索。スペース区切りは AND（Excelで絞り込んでから更に絞るのと同じ感覚）。
 * 先頭に - を付けた語は除外条件。
 *   例: 「グリップ 井殿」= 両方を含む / 「ボール -返品」= ボールを含み返品を含まない
 */
export function matchesQuery(fields: Array<string | number | null | undefined>, query: string): boolean {
  const q = normalizeText(query);
  if (!q) return true;
  const hay = fields.map(normalizeText).filter(Boolean).join("  ");
  for (const raw of q.split(/\s+/)) {
    if (!raw) continue;
    if (raw.startsWith("-") && raw.length > 1) {
      if (hay.includes(raw.slice(1))) return false;
    } else if (!hay.includes(raw)) {
      return false;
    }
  }
  return true;
}

/** 「（未設定）」の表示名。空欄の行を集計から落とさないための共通ラベル */
export const BLANK_LABEL = "（未設定）";

export type Summary = { key: string; count: number; qty: number; amount: number };

/**
 * 商品別・人別などの集計（Excelのピボット相当）。金額の大きい順。
 * qty は個数の合計。個数を持たない表では 0 のままでよい。
 */
export function summarize<T>(
  rows: T[],
  keyOf: (r: T) => string | null | undefined,
  amountOf: (r: T) => number,
  qtyOf?: (r: T) => number,
): Summary[] {
  const map = new Map<string, Summary>();
  for (const r of rows) {
    const key = String(keyOf(r) ?? "").trim() || BLANK_LABEL;
    const cur = map.get(key) ?? { key, count: 0, qty: 0, amount: 0 };
    cur.count += 1;
    cur.qty += qtyOf ? Number(qtyOf(r)) || 0 : 0;
    cur.amount += Number(amountOf(r)) || 0;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount || b.count - a.count || a.key.localeCompare(b.key, "ja"));
}

/** 絞り込みプルダウンの選択肢（件数つき・多い順）。空欄は出さない */
export function optionCounts<T>(rows: T[], keyOf: (r: T) => string | null | undefined): Array<{ value: string; count: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const v = String(keyOf(r) ?? "").trim();
    if (!v) continue;
    map.set(v, (map.get(v) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .map(([value, count]) => ({ value, count }));
}

export type RangePreset = "month" | "3m" | "6m" | "year" | "all" | "custom";

/** 期間の指定。from は含む / to は含まない（DBの gte/lt にそのまま渡せる形） */
export type DateRange = { from: string; to: string; label: string };

function ymOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
/** "2026-08" を n か月ずらす */
export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  return ymOf(new Date(y, m - 1 + n, 1));
}
/** その月の翌月1日（to に使う。月末日を数えなくていい） */
function nextMonthFirst(ym: string): string {
  return `${shiftMonth(ym, 1)}-01`;
}

/**
 * 期間プリセットを実際の日付範囲にする。
 * 基準は「表示中の月(month)」。3か月なら month を含む直近3か月。
 * 「今年」は暦年（1/1〜12/31）。会計年度ではない。
 */
export function resolveRange(opt: {
  preset: RangePreset;
  month: string;
  from?: string | null;
  to?: string | null;
}): DateRange {
  const { preset, month } = opt;
  switch (preset) {
    case "3m": {
      const start = shiftMonth(month, -2);
      return { from: `${start}-01`, to: nextMonthFirst(month), label: `${start} 〜 ${month}（3か月）` };
    }
    case "6m": {
      const start = shiftMonth(month, -5);
      return { from: `${start}-01`, to: nextMonthFirst(month), label: `${start} 〜 ${month}（6か月）` };
    }
    case "year": {
      const y = month.slice(0, 4);
      return { from: `${y}-01-01`, to: `${Number(y) + 1}-01-01`, label: `${y}年（1月〜12月）` };
    }
    case "all":
      return { from: "2000-01-01", to: "2100-01-01", label: "全期間" };
    case "custom": {
      const f = opt.from && /^\d{4}-\d{2}-\d{2}$/.test(opt.from) ? opt.from : `${month}-01`;
      // 入力された終了日は「その日も含む」のが自然なので +1日して to にする
      const rawTo = opt.to && /^\d{4}-\d{2}-\d{2}$/.test(opt.to) ? opt.to : null;
      const t = rawTo ? addDay(rawTo) : nextMonthFirst(month);
      // 逆順に入れられたら入れ替える（エラーにして手を止めない）
      if (t <= f) return { from: t === f ? f : t, to: addDay(f), label: `${rawTo ?? ""} 〜 ${f}` };
      return { from: f, to: t, label: `${f} 〜 ${rawTo ?? ""}` };
    }
    case "month":
    default:
      return { from: `${month}-01`, to: nextMonthFirst(month), label: `${month}` };
  }
}

/** "2026-08-31" +1日 → "2026-09-01"（UTC計算＝タイムゾーンの影響を受けない） */
export function addDay(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
