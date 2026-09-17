/**
 * 受信フィルタの当たり判定（純関数・DBアクセス禁止）— 0045 / #255
 *
 * LINEのリッチメニューを押すと、決まった文言が「お客様のメッセージ」として届く
 * （例「プロの出勤情報」「お問い合わせを希望します」）。人が返信する必要は無いので、
 * 受信した時点で「対応不要（noise）」にして、返信文の提案も作らない。
 * 以前は1日1回の定期処理と /inbox を開いたときにしか当てておらず、
 * その間はホームの「今日やること」に返信案つきで出ていた。
 */
export type FilterRuleLike = {
  id: string;
  source: string; // line / gmail / any
  pattern: string;
  match_type: string; // exact / contains / prefix
  action: string; // noise / low
  active?: boolean | null;
};

/** 全角/半角・前後の空白・改行の違いで外れないようにそろえる */
export function normalizeFilterText(s: string): string {
  return String(s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function ruleMatches(rule: Pick<FilterRuleLike, "pattern" | "match_type">, text: string): boolean {
  const t = normalizeFilterText(text);
  const p = normalizeFilterText(rule.pattern);
  if (!t || !p) return false;
  if (rule.match_type === "exact") return t === p;
  if (rule.match_type === "prefix") return t.startsWith(p);
  return t.includes(p);
}

/** 最初に当たったルール（無効なルールは見ない）。noise を low より優先する */
export function findFilterRule<R extends FilterRuleLike>(rules: R[], source: string, text: string): R | null {
  const usable = rules.filter((r) => r.active !== false && (r.source === "any" || r.source === source));
  return (
    usable.find((r) => r.action === "noise" && ruleMatches(r, text)) ??
    usable.find((r) => r.action !== "noise" && ruleMatches(r, text)) ??
    null
  );
}
