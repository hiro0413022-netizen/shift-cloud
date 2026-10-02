// 見積明細の品名を紙の上で打ち替えたときの分け方（#331・2026-10-02）。実行: npm test
// 現場は「マスタ名のうしろに色・仕様を書き足す」使い方をするので、
// マスタ名（product_name）が残ることをここで固定する。崩れると発注連携と工賃の固定枠が狂う。
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitQuoteItemName } from "../packages/core/src/fitting-quote.ts";

test("マスタ名のうしろに色を書き足す＝spec に入り、マスタ名は残る", () => {
  assert.deepEqual(splitQuoteItemName("ツアーベルベット ピンク", "ツアーベルベット"), {
    product_name: "ツアーベルベット",
    spec: "ピンク",
  });
});

test("全角スペースで書き足しても同じ", () => {
  assert.deepEqual(splitQuoteItemName("ツアーベルベット　ピンク", "ツアーベルベット"), {
    product_name: "ツアーベルベット",
    spec: "ピンク",
  });
});

test("マスタ名のままなら spec は空に戻す（書き足しを消した）", () => {
  assert.deepEqual(splitQuoteItemName("ツアーベルベット", "ツアーベルベット"), {
    product_name: "ツアーベルベット",
    spec: null,
  });
});

test("まるごと違う文字を打ったら品名を差し替えて spec は空", () => {
  assert.deepEqual(splitQuoteItemName("MCI 80 S", "ツアーベルベット"), {
    product_name: "MCI 80 S",
    spec: null,
  });
});

test("空にしたら「直さない」＝null（product_name は NOT NULL なので潰さない）", () => {
  assert.equal(splitQuoteItemName("", "ツアーベルベット"), null);
  assert.equal(splitQuoteItemName("   ", "ツアーベルベット"), null);
  assert.equal(splitQuoteItemName("　", "ツアーベルベット"), null);
});

test("前後の空白と連続空白は詰める", () => {
  assert.deepEqual(splitQuoteItemName("  ツアーベルベット   ピンク  ", "ツアーベルベット"), {
    product_name: "ツアーベルベット",
    spec: "ピンク",
  });
});

test("マスタ名が空の行（手入力）はそのまま品名になる", () => {
  assert.deepEqual(splitQuoteItemName("特別作業 一式", ""), {
    product_name: "特別作業 一式",
    spec: null,
  });
});

test("マスタ名を含むが先頭ではない＝差し替え扱い", () => {
  assert.deepEqual(splitQuoteItemName("新 ツアーベルベット", "ツアーベルベット"), {
    product_name: "新 ツアーベルベット",
    spec: null,
  });
});
