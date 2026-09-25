// sales-drill.ts — 売上分析のカテゴリ詳細（#277）の純粋ロジック（DBアクセス禁止・server-only禁止）
// tests/sales-drill.test.ts から直接importしてテストする。
//
// 売上1行を「何が売れたか」の単位（品目）に分けて集計する。
// 出どころは3つあり、どれも最後は SaleFact に揃える:
//   - mon_sales_lines … GOLF WING の売上台帳（Excel）の明細
//   - mon_sales(source='app') … Money OS の売上入力（detail.product_name 等）
//   - mon_sales(source='square') … FRANK の Square（detail.items / 会員プラン / memo）
// mon_sales(source='ledger') は lines の月次ロールアップなので、ここでは使わない（二重計上防止）。

export type SaleItem = { name: string; qty: number; amount: number };

/** 集計の最小単位。amount は税抜（上段カードと同じ物差し） */
export type SaleFact = {
  id: string;
  date: string; // YYYY-MM-DD
  category: string;
  amount: number;
  /** 品目。1取引に複数品目がある（Squareの注文・モバイルオーダー）ときは複数 */
  items: SaleItem[];
  /** 種類（シャフト・グリップ… / 前取り・自動課金… ）。無ければ空 */
  type: string;
  maker: string;
  customer: string;
  memberKind: string;
  pay: string;
  pro: string;
  memo: string;
  source: string;
};

export const NO_NAME = "（品名なし）";

/** 台帳の品目名 → 上段カードのカテゴリ名（refresh_mon_sales_from_lines と同じ置き換え） */
export function ledgerCategory(itemCategory: string | null | undefined): string {
  const c = String(itemCategory ?? "").trim() || "その他";
  return c === "月会費" ? "月会費(窓口)" : c;
}

/** 品目名の表記ゆれ（全角半角・前後空白）を揃えて、同じ商品を1行にまとめる */
export function itemKey(name: string): string {
  return name.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * 1取引の税抜金額を品目へ配る。
 * 品目の金額（Squareは税込・円、台帳は税抜）を比率として使い、合計がちょうど取引の金額になるよう
 * 端数は最後の品目に寄せる。品目の金額が全部0なら数量で按分する。
 */
export function allocate(total: number, items: SaleItem[]): number[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [total];
  const w = items.map((i) => Math.max(0, Number(i.amount) || 0));
  let sum = w.reduce((a, b) => a + b, 0);
  const weights = sum > 0 ? w : items.map((i) => Math.max(1, Number(i.qty) || 1));
  sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((x) => Math.round((total * x) / sum));
  const diff = total - out.reduce((a, b) => a + b, 0);
  out[out.length - 1] += diff;
  return out;
}

/** memo から品目名を作る（Squareの既定メモや会員番号の括弧は外す） */
export function nameFromMemo(memo: string | null | undefined): string {
  let s = String(memo ?? "").trim();
  if (!s || s === "Square店頭決済") return "";
  s = s.replace(/^Square:\s*/, "");
  s = s.replace(/（[^）]*）.*$/, "").trim(); // 「Web入会 前取り2か月分（FR0070）／…」→「Web入会 前取り2か月分」
  return s;
}

export type RankRow = { key: string; name: string; type: string; amount: number; qty: number; count: number };
export type SimpleRow = { name: string; amount: number; count: number };

export type Drill = {
  total: number;
  count: number;
  qty: number;
  customers: number;
  items: RankRow[];
  types: SimpleRow[];
  memberKinds: SimpleRow[];
  pays: SimpleRow[];
  pros: SimpleRow[];
  daily: { date: string; amount: number }[];
  /** 品目名が分からない取引の件数（Squareで明細が取れていない等） */
  unnamed: number;
};

function bump(m: Map<string, SimpleRow>, name: string, amount: number) {
  const k = name || "（未設定）";
  const r = m.get(k) ?? { name: k, amount: 0, count: 0 };
  r.amount += amount;
  r.count += 1;
  m.set(k, r);
}

const sortRows = <T extends { amount: number }>(rows: T[]) => rows.sort((a, b) => b.amount - a.amount);

/** 月の日付一覧（YYYY-MM-DD） */
export function daysOf(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/** カテゴリ1つ・1か月分の事実から、画面に出す集計を作る */
export function buildDrill(facts: SaleFact[], month: string): Drill {
  const items = new Map<string, RankRow>();
  const types = new Map<string, SimpleRow>();
  const kinds = new Map<string, SimpleRow>();
  const pays = new Map<string, SimpleRow>();
  const pros = new Map<string, SimpleRow>();
  const daily = new Map<string, number>();
  const customers = new Set<string>();
  let total = 0;
  let qty = 0;
  let unnamed = 0;

  for (const f of facts) {
    total += f.amount;
    daily.set(f.date, (daily.get(f.date) ?? 0) + f.amount);
    if (f.customer) customers.add(f.customer);
    if (f.type) bump(types, f.type, f.amount);
    bump(kinds, f.memberKind, f.amount);
    bump(pays, f.pay, f.amount);
    if (f.pro) bump(pros, f.pro, f.amount);

    const list = f.items.length ? f.items : [{ name: NO_NAME, qty: 1, amount: f.amount }];
    if (list.every((i) => i.name === NO_NAME)) unnamed++;
    const shares = allocate(f.amount, list);
    list.forEach((it, i) => {
      const key = itemKey(it.name);
      const r = items.get(key) ?? { key, name: it.name, type: f.type, amount: 0, qty: 0, count: 0 };
      r.amount += shares[i];
      r.qty += Math.max(0, Number(it.qty) || 0);
      r.count += 1;
      items.set(key, r);
      qty += Math.max(0, Number(it.qty) || 0);
    });
  }

  const ranked = sortRows([...items.values()]);
  // 品名なしは件数が多くても最後に回す（「何が売れたか」の答えにならないため）
  ranked.sort((a, b) => (a.name === NO_NAME ? 1 : 0) - (b.name === NO_NAME ? 1 : 0) || b.amount - a.amount);

  return {
    total,
    count: facts.length,
    qty,
    customers: customers.size,
    items: ranked,
    types: sortRows([...types.values()]),
    memberKinds: sortRows([...kinds.values()]),
    pays: sortRows([...pays.values()]),
    pros: sortRows([...pros.values()]),
    daily: daysOf(month).map((d) => ({ date: d, amount: daily.get(d) ?? 0 })),
    unnamed,
  };
}

/** 品目で絞った取引一覧（品目キーが一致する明細を持つ取引） */
export function factsWithItem(facts: SaleFact[], key: string): SaleFact[] {
  return facts.filter((f) => (f.items.length ? f.items : [{ name: NO_NAME, qty: 1, amount: 0 }]).some((i) => itemKey(i.name) === key));
}
