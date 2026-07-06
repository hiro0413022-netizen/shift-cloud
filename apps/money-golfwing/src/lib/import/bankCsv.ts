// bankCsv.ts — カード/口座CSVの取込パーサ（Money OS 共通コア）
// mon_bank_source.mapping プロファイルに従い、AMEX / 尼崎信金などのCSVを
// mon_bank_txn 行へ正規化する。依存なし（Node / Edge どちらでも動作）。
//
// 符号規約: amount は「出金= 負 / 入金= 正」に統一。
//   - amex(charge_positive): 金額列は支払=正 → amount = -金額
//   - amashin(in_minus_out): amount = 入金 - 出金
// 重複防止: dedup_key を生成。DB側 unique(company_id, source_id, dedup_key) で再取込を弾く。
//   - 残高あり(口座): code|date|amount|balance（残高が行を一意化）
//   - 残高なし(カード): code|date|amount|desc|#occ（同一明細の出現順で一意化）

export type BankMapping = {
  encoding?: string;
  header_row?: number;
  date_col?: string;
  desc_col?: string;
  amount_col?: string;        // charge_positive用
  out_col?: string;           // in_minus_out用
  in_col?: string;            // in_minus_out用
  balance_col?: string;
  kind_col?: string;
  cardholder_col?: string;
  amount_rule: "charge_positive" | "in_minus_out";
  date_format: "YYYY/MM/DD" | "JP_ERA_YMD";
};

export type NormalizedTxn = {
  txn_date: string;           // ISO 'YYYY-MM-DD'
  description: string;
  amount: number;             // 出金=負 / 入金=正
  balance: number | null;
  dedup_key: string;
  raw: Record<string, string>;
};

export type ParseResult = {
  rows: NormalizedTxn[];
  errors: string[];
};

/** カンマ・全角数字・引用符を除いて数値化。空は0。 */
export function toNumber(input: string | undefined | null): number {
  if (input == null) return 0;
  let s = String(input).trim().replace(/[",，\s]/g, "");
  if (s === "") return 0;
  // 全角数字→半角
  s = s.replace(/[０-９．－]/g, (c) => "0123456789.-"["０１２３４５６７８９．－".indexOf(c)]);
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** 日付を ISO 'YYYY-MM-DD' へ。対応: 'YYYY/MM/DD' と '2025年9月1日'(JP_ERA_YMD)。 */
export function parseDate(value: string, fmt: BankMapping["date_format"]): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (fmt === "JP_ERA_YMD") {
    const m = v.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (!m) return null;
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  // YYYY/MM/DD (・- 区切りも許容)
  const m = v.replace(/[.\-]/g, "/").match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** 最小CSVパーサ（"..." 内のカンマ・改行に対応）。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * CSVテキスト(復号済み) を正規化行へ。sourceCode は dedup_key の接頭辞。
 */
export function parseBankCsv(text: string, mapping: BankMapping, sourceCode: string): ParseResult {
  const table = parseCsv(text);
  const errors: string[] = [];
  const headerRow = mapping.header_row ?? 0;
  const header = (table[headerRow] ?? []).map((h) => h.trim());
  const idx = (name?: string) => (name ? header.indexOf(name) : -1);

  const di = idx(mapping.date_col);
  const desci = idx(mapping.desc_col);
  const ai = idx(mapping.amount_col);
  const outi = idx(mapping.out_col);
  const ini = idx(mapping.in_col);
  const bi = idx(mapping.balance_col);

  const rows: NormalizedTxn[] = [];
  const occ = new Map<string, number>(); // カード用: 同一明細の出現回数

  for (let r = headerRow + 1; r < table.length; r++) {
    const cols = table[r];
    if (!cols || cols.every((c) => (c ?? "").trim() === "")) continue;

    const date = parseDate(cols[di] ?? "", mapping.date_format);
    if (!date) { errors.push(`${r + 1}行目: 日付を解釈できません (${cols[di] ?? ""})`); continue; }

    const description = (cols[desci] ?? "").trim();

    let amount = 0;
    if (mapping.amount_rule === "charge_positive") {
      amount = -toNumber(cols[ai]);                 // 支払=正 → 出金(負)へ
    } else {
      amount = toNumber(cols[ini]) - toNumber(cols[outi]); // 入金 - 出金
    }

    const balance = bi >= 0 && (cols[bi] ?? "").trim() !== "" ? toNumber(cols[bi]) : null;

    let dedup_key: string;
    if (balance != null) {
      dedup_key = `${sourceCode}|${date}|${amount}|${balance}`;
    } else {
      const base = `${sourceCode}|${date}|${amount}|${description}`;
      const n = occ.get(base) ?? 0;
      occ.set(base, n + 1);
      dedup_key = `${base}|#${n}`;
    }

    const raw: Record<string, string> = {};
    header.forEach((h, i) => { if (h) raw[h] = (cols[i] ?? "").trim(); });

    rows.push({ txn_date: date, description, amount, balance, dedup_key, raw });
  }
  return { rows, errors };
}
