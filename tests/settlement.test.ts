import test from "node:test";
import assert from "node:assert/strict";
import {
  suggestTxnsForExpense,
  usedTxnIdSet,
  type ExpenseRow,
  type TxnRow,
  // ※ import は .ts 拡張子付きが必須（node --test の型ストリップの制約）
} from "../apps/money-golfwing/src/lib/settlement.ts";

/* ============================================================
   経費（発生）と 出金（支払）の突合候補（DECISIONS #108 / migration 0096）

   PLの経費は「mon_expense（発生）＋ 確定出金（支払）」の足し算なので、
   同じ支払が両方に入ると二重計上になる。突合すると集計側が出金から差し引く。
   ここでは「どれとどれが同じ支払か」の候補出しを固定する。
   ============================================================ */

const E = (over: Partial<ExpenseRow> = {}): ExpenseRow => ({
  id: "e1",
  spent_on: "2026-07-31",
  item: "パーソナルレッスン手当",
  payee: "安東茉優",
  category: "外注",
  amount: 144000,
  settled_txn_id: null,
  ...over,
});

const T = (id: string, date: string, amount: number, description: string): TxnRow => ({
  id,
  txn_date: date,
  description,
  amount,
});

test("金額と支払先が両方一致する出金を最優先で返す", () => {
  const s = suggestTxnsForExpense(E(), [
    T("t1", "2026-08-25", -144000, "ﾌﾘｺﾐ ﾀﾅｶ"),
    T("t2", "2026-08-25", -144000, "振込 安東茉優"),
  ]);
  assert.equal(s[0].txn.id, "t2");
  assert.equal(s[0].reason, "金額・支払先が一致");
  assert.equal(s[1].reason, "金額が一致");
});

test("入金（プラス）は候補にしない", () => {
  const s = suggestTxnsForExpense(E(), [T("t1", "2026-08-25", 144000, "振込 安東茉優")]);
  assert.equal(s.length, 0);
});

test("支払日が発生から離れすぎている出金は除外（翌々月末は拾い、半年後は拾わない）", () => {
  const near = suggestTxnsForExpense(E(), [T("t1", "2026-10-10", -144000, "")]); // +71日
  assert.equal(near.length, 1);
  const far = suggestTxnsForExpense(E(), [T("t1", "2027-01-31", -144000, "")]);
  assert.equal(far.length, 0);
});

test("前払い（発生より前の出金）も1か月までは候補になる", () => {
  assert.equal(suggestTxnsForExpense(E(), [T("t1", "2026-07-10", -144000, "")]).length, 1); // -21日
  assert.equal(suggestTxnsForExpense(E(), [T("t1", "2026-06-10", -144000, "")]).length, 0); // -51日
});

test("金額も支払先も一致しないものは候補にしない", () => {
  const s = suggestTxnsForExpense(E(), [T("t1", "2026-08-25", -50000, "ﾌﾘｺﾐ ｽｽﾞｷ")]);
  assert.equal(s.length, 0);
});

test("摘要の空白は無視して支払先を照合する", () => {
  const s = suggestTxnsForExpense(E({ payee: "安東 茉優" }), [
    T("t1", "2026-08-25", -99999, "振込　安東茉優　様"),
  ]);
  assert.equal(s.length, 1);
  assert.equal(s[0].reason, "支払先が一致");
});

test("支払先が1文字なら誤検知を避けて照合しない", () => {
  const s = suggestTxnsForExpense(E({ payee: "林", amount: 1 }), [
    T("t1", "2026-08-25", -99999, "コバヤシデンコウ"),
  ]);
  assert.equal(s.length, 0);
});

test("同点なら発生日に近い出金を先に返す", () => {
  const s = suggestTxnsForExpense(E(), [
    T("far", "2026-09-20", -144000, ""),
    T("near", "2026-08-05", -144000, ""),
  ]);
  assert.equal(s[0].txn.id, "near");
});

test("すでに他の経費で使われている出金は候補から外す（1つの出金を二重に消込まない）", () => {
  const used = usedTxnIdSet([E({ id: "other", settled_txn_id: "t1" })]);
  const s = suggestTxnsForExpense(E(), [T("t1", "2026-08-25", -144000, "安東茉優")], used);
  assert.equal(s.length, 0);
});
