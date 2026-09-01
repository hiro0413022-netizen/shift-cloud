import test from "node:test";
import assert from "node:assert/strict";
import {
  expenseEffect,
  expenseInputError,
  payMethodLabel,
  isCategoryUnset,
  EXPENSE_CATEGORIES,
} from "../apps/money-golfwing/src/lib/expense.ts";

/* ============================================================
   スタッフによる経費入力（#191）
   支払い方法ごとに「帳簿のどこが動くか」を固定する。
   ここがズレると、レジの残高が合わない／振込が二重に計上される。
   ============================================================ */

test("店の現金で払ったら現金出納にも出金を書く", () => {
  const e = expenseEffect("cash");
  assert.equal(e.writeCashOut, true);
  assert.equal(e.pending, null);
  assert.match(e.note, /現金出納/);
});

test("立替は店のお金が動かない。精算待ちとして残す", () => {
  const e = expenseEffect("advance");
  assert.equal(e.writeCashOut, false);
  assert.equal(e.pending, "reimburse");
});

test("掛けは銀行側からも入るので消込が要る", () => {
  const e = expenseEffect("credit");
  assert.equal(e.writeCashOut, false);
  assert.equal(e.pending, "settle");
  assert.match(e.note, /消込/);
});

test("未知の支払い方法では何も書かない", () => {
  const e = expenseEffect("paypay");
  assert.equal(e.writeCashOut, false);
  assert.equal(e.pending, null);
});

test("入力チェック: 日付・金額・品名・支払い方法", () => {
  const ok = { spentOn: "2026-09-01", amount: 1200, item: "ボール", method: "cash" };
  assert.equal(expenseInputError(ok), null);
  assert.equal(expenseInputError({ ...ok, spentOn: "2026/09/01" }), "日付を選んでください");
  assert.equal(expenseInputError({ ...ok, amount: 0 }), "金額を入れてください");
  assert.equal(expenseInputError({ ...ok, amount: -100 }), "金額を入れてください");
  assert.equal(expenseInputError({ ...ok, item: "  " }), "品名（何を買ったか）を入れてください");
  assert.equal(expenseInputError({ ...ok, method: "" }), "支払い方法を選んでください");
});

test("立替は誰が立替えたかを必ず聞く", () => {
  const base = { spentOn: "2026-09-01", amount: 500, item: "電池", method: "advance" };
  assert.equal(expenseInputError(base), "立替えた方のお名前を入れてください");
  assert.equal(expenseInputError({ ...base, paidBy: "林 和希" }), null);
});

test("科目は未設定（わからない）を許す＝本部があとで直す", () => {
  assert.equal(isCategoryUnset(""), true);
  assert.equal(isCategoryUnset(null), true);
  assert.equal(isCategoryUnset("仕入"), false);
});

test("科目ボタンの表記は集計の対応表に合わせてある", () => {
  // mon_category_map(src_kind='expense') に実在する表記（2026-09-01 実データで確認）
  const mapped = new Set(["仕入", "備品", "水道光熱費", "広告", "送料", "外注", "家賃"]);
  const shown = EXPENSE_CATEGORIES.map((c) => c.value);
  // 「支払手数料」「その他経費」は対応表に無く other_expense に落ちる＝意図どおり
  for (const v of shown) {
    if (v === "支払手数料" || v === "その他経費") continue;
    assert.ok(mapped.has(v), `${v} は対応表に無い`);
  }
});

test("支払い方法のラベル", () => {
  assert.equal(payMethodLabel("cash"), "店の現金");
  assert.equal(payMethodLabel("advance"), "立替");
  assert.equal(payMethodLabel("credit"), "掛け（後日振込）");
  assert.equal(payMethodLabel("nope"), "nope");
});
