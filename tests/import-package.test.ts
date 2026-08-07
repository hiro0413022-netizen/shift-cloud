// @yozan/import（MODULARIZATION_PLAN ①）のテスト。
// パーサ系は bankCsv からの逐語切り出しなので、ここでは
// 「切り出し元と同一の挙動であること」と、新設した toCsv / tableToRecords を固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, toCsv, csvEscape } from "../packages/import/src/csv.ts";
import { decoderLabel, decodeText } from "../packages/import/src/decode.ts";
import { toNumber, parseDate, makeDedupKey } from "../packages/import/src/normalize.ts";
import { headerIndex, tableToRecords } from "../packages/import/src/table.ts";
import {
  parseCsv as origParseCsv,
  toNumber as origToNumber,
  parseDate as origParseDate,
} from "../apps/money-golfwing/src/lib/import/bankCsv.ts";

test("切り出し元(bankCsv)とパース結果が一致する（挙動ドリフトの検知）", () => {
  const csv = 'a,"b,1","c""q"\r\nd,"e\nf",g\n';
  assert.deepEqual(parseCsv(csv), origParseCsv(csv));
  for (const v of ["1,234", "１２３４", "－５．５", "", null, "abc"]) {
    assert.equal(toNumber(v), origToNumber(v));
  }
  assert.equal(parseDate("2025年9月1日", "JP_ERA_YMD"), origParseDate("2025年9月1日", "JP_ERA_YMD"));
  assert.equal(parseDate("2025/9/1", "YYYY/MM/DD"), origParseDate("2025/9/1", "YYYY/MM/DD"));
});

test("toCsv: エスケープ・CRLF・既定でBOM付き（Excelの文字化け対策）", () => {
  const out = toCsv([["名前", "備考"], ["山田", 'カンマ,と"引用符"']]);
  assert.ok(out.startsWith("﻿"), "BOMが先頭に付くこと");
  assert.ok(out.includes('"山田","カンマ,と""引用符"""'));
  assert.ok(out.endsWith("\r\n"));
  // 往復: toCsvの出力をparseCsvで読むと元に戻る（BOMは呼び出し側で除く）
  const back = parseCsv(out.slice(1).trimEnd());
  assert.deepEqual(back, [["名前", "備考"], ["山田", 'カンマ,と"引用符"']]);
  // 内部用途はBOMなし
  assert.ok(!toCsv([["a"]], { bom: false }).startsWith("﻿"));
});

test("csvEscape: null/undefinedは空文字", () => {
  assert.equal(csvEscape(null), '""');
  assert.equal(csvEscape(undefined), '""');
});

test("decode: cp932系ラベルの吸収とShift_JIS復号", () => {
  assert.equal(decoderLabel("cp932"), "shift_jis");
  assert.equal(decoderLabel("MS932"), "shift_jis");
  assert.equal(decoderLabel(undefined), "utf-8");
  // 「金額」のShift_JISバイト列
  const sjis = new Uint8Array([0x8b, 0xe0, 0x8a, 0x7a]);
  assert.equal(decodeText(sjis, "cp932"), "金額");
  assert.equal(decodeText(new TextEncoder().encode("金額")), "金額");
});

test("makeDedupKey: bankCsvの規約どおり | 区切り・null/undefinedは空", () => {
  assert.equal(makeDedupKey(["amex", "2026-08-01", -1234, "スターバックス"]), "amex|2026-08-01|-1234|スターバックス");
  assert.equal(makeDedupKey(["a", null, undefined, 0]), "a|||0");
});

test("tableToRecords: 前置き行スキップ・空行スキップ・列名で引ける", () => {
  const table = parseCsv(
    "カード明細,,\n日付,摘要,金額\n2026/08/01,コーヒー,500\n,,\n2026/08/02,本,1500\n",
  );
  const { header, records } = tableToRecords(table, 1);
  assert.deepEqual(header, ["日付", "摘要", "金額"]);
  assert.equal(records.length, 2);
  assert.equal(records[0]["摘要"], "コーヒー");
  const idx = headerIndex(header);
  assert.equal(idx("金額"), 2);
  assert.equal(idx("存在しない列"), -1);
  assert.equal(idx(null), -1);
});
