// money-util.ts — Money OS の純粋ユーティリティ（DBアクセス禁止・server-only禁止）
// tests/money-util.test.ts から直接importしてテストする。

/** "1,234" / 全角 → number。解釈不能は0。 */
export function toNum(input: FormDataEntryValue | null): number {
  if (input == null) return 0;
  let s = String(input).trim().replace(/[",，\s]/g, "");
  s = s.replace(/[０-９．－]/g, (c) => "0123456789.-"["０１２３４５６７８９．－".indexOf(c)]);
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** "YYYY-MM" → その月の月初/翌月初（fromはinclusive、toはexclusive） */
export function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const nm = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from, to: nm };
}
