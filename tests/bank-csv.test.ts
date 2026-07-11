// 銀行/カードCSV取込パーサのテスト（Money OS）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toNumber,
  parseDate,
  parseCsv,
  parseBankCsv,
  type BankMapping,
} from "../apps/money-golfwing/src/lib/import/bankCsv.ts";

test("parseCsv: 引用符内のカンマ・改行・二重引用符", () => {
  const rows = parseCsv('a,"b,1","c""q"\r\nd,"e\nf",g\n');
  assert.deepEqual(rows, [
    ["a", "b,1", 'c"q'],
    ["d", "e\nf", "g"],
  ]);
});

test("parseDate: YYYY/MM/DD と 和文年月日", () => {
  assert.equal(parseDate("2026/7/1", "YYYY/MM/DD"), "2026-07-01");
  assert.equal(parseDate("2026-07-01", "YYYY/MM/DD"), "2026-07-01");
  assert.equal(parseDate("2025年9月1日", "JP_ERA_YMD"), "2025-09-01");
  assert.equal(parseDate("", "YYYY/MM/DD"), null);
  assert.equal(parseDate("invalid", "JP_ERA_YMD"), null);
});

test("toNumber: 空・カンマ・全角", () => {
  assert.equal(toNumber("12,345"), 12345);
  assert.equal(toNumber(""), 0);
  assert.equal(toNumber(undefined), 0);
});

const amexMapping: BankMapping = {
  date_col: "ご利用日",
  desc_col: "ご利用内容",
  amount_col: "金額",
  amount_rule: "charge_positive",
  date_format: "YYYY/MM/DD",
};

test("parseBankCsv(AMEX型): 支払=正 → amount負・同一明細は出現順dedup", () => {
  const csv = [
    "ご利用日,ご利用内容,金額",
    "2026/06/01,GOOGLE ADS,10000",
    "2026/06/01,GOOGLE ADS,10000", // 同額同日の2件目
    "2026/06/02,ENEOS,5000",
  ].join("\n");
  const { rows, errors } = parseBankCsv(csv, amexMapping, "amex");
  assert.equal(errors.length, 0);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].amount, -10000); // 出金=負の符号規約
  assert.equal(rows[0].dedup_key, "amex|2026-06-01|-10000|GOOGLE ADS|#0");
  assert.equal(rows[1].dedup_key, "amex|2026-06-01|-10000|GOOGLE ADS|#1"); // 2件目は別キー
  assert.equal(rows[2].txn_date, "2026-06-02");
});

const amashinMapping: BankMapping = {
  date_col: "日付",
  desc_col: "摘要",
  out_col: "出金",
  in_col: "入金",
  balance_col: "残高",
  amount_rule: "in_minus_out",
  date_format: "YYYY/MM/DD",
};

test("parseBankCsv(口座型): 入金-出金・残高でdedup", () => {
  const csv = [
    "日付,摘要,出金,入金,残高",
    "2026/06/01,IBﾌﾘｺﾐ ﾔﾏﾀﾞ,30000,,970000",
    '2026/06/05,ﾆﾕｳｷﾝ,,"100,000",1070000',
  ].join("\n");
  const { rows, errors } = parseBankCsv(csv, amashinMapping, "amashin");
  assert.equal(errors.length, 0);
  assert.equal(rows[0].amount, -30000);
  assert.equal(rows[0].balance, 970000);
  assert.equal(rows[0].dedup_key, "amashin|2026-06-01|-30000|970000");
  assert.equal(rows[1].amount, 100000);
});

test("parseBankCsv: 不正な日付行はエラーに積んでスキップ", () => {
  const csv = ["ご利用日,ご利用内容,金額", "合計,,15000", "2026/06/02,ENEOS,5000"].join("\n");
  const { rows, errors } = parseBankCsv(csv, amexMapping, "amex");
  assert.equal(rows.length, 1);
  assert.equal(errors.length, 1);
});
