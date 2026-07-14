// 見積の計算ロジック（0057）。
// 金額はすべて税抜で持ち、値引 → 消費税 → 税込合計 の順に計算する。
// 初期費用（build）と月額（monthly）は最後まで別集計。

export const OPTION_CATEGORIES: Record<string, string> = {
  sns: "SNS・集客",
  reserve: "予約・LINE",
  branding: "ブランディング・撮影",
  content: "コンテンツ・ページ",
  seo: "SEO・解析",
  support: "保守・サポート",
  other: "その他",
};

export type QuoteItem = {
  key: string;
  name: string;
  unit: string;
  qty: number;
  build: number; // 単価（税抜・初期費用）
  monthly: number; // 単価（税抜・月額）
  description?: string;
};

export type QuoteInput = {
  planName: string | null;
  planBuild: number;
  planMonthly: number;
  items: QuoteItem[];
  discountBuild: number;
  discountMonthly: number;
  taxRate: number; // 0.10
};

export type QuoteTotals = {
  subtotalBuild: number; // 値引前・税抜
  subtotalMonthly: number;
  netBuild: number; // 値引後・税抜
  netMonthly: number;
  taxBuild: number;
  taxMonthly: number;
  totalBuild: number; // 税込
  totalMonthly: number;
  firstPayment: number; // 初期費用（税込）＋初月月額（税込）
  yearOne: number; // 初年度合計（税込）= 初期費用 + 月額×12
};

export function calcQuote(q: QuoteInput): QuoteTotals {
  const itemsBuild = q.items.reduce((a, i) => a + i.build * i.qty, 0);
  const itemsMonthly = q.items.reduce((a, i) => a + i.monthly * i.qty, 0);
  const subtotalBuild = (q.planBuild || 0) + itemsBuild;
  const subtotalMonthly = (q.planMonthly || 0) + itemsMonthly;
  const netBuild = Math.max(0, subtotalBuild - (q.discountBuild || 0));
  const netMonthly = Math.max(0, subtotalMonthly - (q.discountMonthly || 0));
  const taxBuild = Math.floor(netBuild * q.taxRate);
  const taxMonthly = Math.floor(netMonthly * q.taxRate);
  const totalBuild = netBuild + taxBuild;
  const totalMonthly = netMonthly + taxMonthly;
  return {
    subtotalBuild,
    subtotalMonthly,
    netBuild,
    netMonthly,
    taxBuild,
    taxMonthly,
    totalBuild,
    totalMonthly,
    firstPayment: totalBuild + totalMonthly,
    yearOne: totalBuild + totalMonthly * 12,
  };
}

export const yen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;

/** 見積書番号: YZ-20260714-AB12 */
export function quoteNo(seed: string) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `YZ-${ymd}-${seed.slice(0, 4).toUpperCase()}`;
}

/** 営業ドキュメント（dms_documents.kind='quote'）用のMarkdown */
export function quoteMarkdown(args: {
  clinicName: string;
  quoteNo: string;
  issueDate: string;
  validUntil: string;
  q: QuoteInput;
  totals: QuoteTotals;
  issuerName: string;
  issuerNote?: string | null;
  note?: string | null;
}): string {
  const { q, totals } = args;
  const rows: string[] = [];
  if (args.q.planName) {
    rows.push(`| ${q.planName}（基本プラン） | 1式 | ${yen(q.planBuild)} | ${q.planMonthly ? yen(q.planMonthly) : "—"} |`);
  }
  for (const i of q.items) {
    rows.push(
      `| ${i.name} | ${i.qty}${i.unit} | ${i.build ? yen(i.build * i.qty) : "—"} | ${i.monthly ? yen(i.monthly * i.qty) : "—"} |`
    );
  }
  return `# お見積書

${args.clinicName} 御中

見積番号: ${args.quoteNo}　発行日: ${args.issueDate}　有効期限: ${args.validUntil}
発行: ${args.issuerName}

| 項目 | 数量 | 初期費用（税抜） | 月額（税抜） |
|---|---|---|---|
${rows.join("\n")}
| **小計（税抜）** | | **${yen(totals.subtotalBuild)}** | **${yen(totals.subtotalMonthly)}** |
${q.discountBuild || q.discountMonthly ? `| 値引 | | -${yen(q.discountBuild)} | -${yen(q.discountMonthly)} |\n` : ""}| 消費税（${Math.round(q.taxRate * 100)}%） | | ${yen(totals.taxBuild)} | ${yen(totals.taxMonthly)} |
| **合計（税込）** | | **${yen(totals.totalBuild)}** | **${yen(totals.totalMonthly)}／月** |

- ご契約時のお支払い（初期費用＋初月分）: **${yen(totals.firstPayment)}**（税込）
- 初年度合計（初期費用＋月額12か月）: **${yen(totals.yearOne)}**（税込）

${args.issuerNote ?? ""}
${args.note ? `\n**備考**: ${args.note}` : ""}
`;
}
