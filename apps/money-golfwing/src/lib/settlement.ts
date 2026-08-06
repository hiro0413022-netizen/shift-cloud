// settlement.ts — 経費（発生）と 銀行/カード出金（支払）の突合候補を出す純粋ロジック
// DBアクセス禁止・server-only禁止。tests/settlement.test.ts から直接importしてテストする。
//
// なぜ必要か（DECISIONS #108）:
//   PLの経費 = mon_expense（発生ベース） + mon_bank_txn の確定出金（支払ベース）
//   同じ支払が両方に入ると二重計上になる。`mon_expense.settled_txn_id` で1:1に結ぶと
//   集計側が出金からその分を差し引くので、**突合した瞬間に二重計上が消える**。
//   このモジュールは「どれとどれが同じ支払か」の候補を人に提示するための当たりをつける。

export type ExpenseRow = {
  id: string;
  spent_on: string; // YYYY-MM-DD
  item: string | null;
  payee: string | null;
  category: string | null;
  amount: number;
  settled_txn_id: string | null;
};

export type TxnRow = {
  id: string;
  txn_date: string; // YYYY-MM-DD
  description: string | null;
  /** 出金はマイナス（CSV取込のまま） */
  amount: number;
};

export type Suggestion = {
  txn: TxnRow;
  /** 画面に出す理由。人が納得できないと押せない */
  reason: "金額・支払先が一致" | "金額が一致" | "支払先が一致";
};

/** 支払は発生の後に来るのが普通。前払いも1か月までは許す（DECISIONS #108） */
export const SETTLE_WINDOW_DAYS_BEFORE = 31; // 発生より前（前払い）
export const SETTLE_WINDOW_DAYS_AFTER = 75; // 発生より後（翌月末払い等）

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

/**
 * 支払先の照合。CSVの摘要は半角カナや余分な記号が入るので、
 * 記号・空白を落としたうえで部分一致を見る（カナの正規化まではやらない＝誤検知を避ける）。
 */
function payeeMatches(payee: string | null, description: string | null): boolean {
  const p = (payee ?? "").replace(/[\s　]/g, "");
  if (p.length < 2) return false; // 1文字の支払先は誤検知しかしない
  const d = (description ?? "").replace(/[\s　]/g, "");
  return d.includes(p);
}

/**
 * ひとつの経費に対する支払候補を、確からしい順に返す。
 * 強い順: 金額と支払先の両方が一致 > 金額が一致 > 支払先が一致。同点なら日付が近い方。
 * すでに他の経費で使われている取引（usedTxnIds）は候補から外す＝1つの出金を二重に消込まない。
 */
export function suggestTxnsForExpense(
  expense: ExpenseRow,
  txns: TxnRow[],
  usedTxnIds: ReadonlySet<string> = new Set(),
  limit = 5
): Suggestion[] {
  const found: { s: Suggestion; rank: number; gap: number }[] = [];

  for (const t of txns) {
    if (t.amount >= 0) continue; // 出金のみ
    if (usedTxnIds.has(t.id)) continue;

    const gap = daysBetween(t.txn_date, expense.spent_on);
    if (gap < -SETTLE_WINDOW_DAYS_BEFORE || gap > SETTLE_WINDOW_DAYS_AFTER) continue;

    const amountHit = Math.abs(t.amount) === expense.amount;
    const payeeHit = payeeMatches(expense.payee, t.description);
    if (!amountHit && !payeeHit) continue;

    const reason: Suggestion["reason"] =
      amountHit && payeeHit ? "金額・支払先が一致" : amountHit ? "金額が一致" : "支払先が一致";
    const rank = amountHit && payeeHit ? 0 : amountHit ? 1 : 2;

    found.push({ s: { txn: t, reason }, rank, gap: Math.abs(gap) });
  }

  found.sort((a, b) => a.rank - b.rank || a.gap - b.gap);
  return found.slice(0, limit).map((f) => f.s);
}

/** 突合済みの取引ID一覧（候補から外すために使う） */
export function usedTxnIdSet(expenses: ExpenseRow[]): Set<string> {
  const s = new Set<string>();
  for (const e of expenses) if (e.settled_txn_id) s.add(e.settled_txn_id);
  return s;
}
