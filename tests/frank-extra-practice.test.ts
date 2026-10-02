// 追加練習チケット（55分 2,750円税込・#332・2026-10-02）。実行: npm test
// 金額とマスター会員ご案内の境目、次の枠の出し方を固定する。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXTRA_PRACTICE_KIND,
  EXTRA_PRACTICE_MINUTES,
  EXTRA_PRACTICE_PRICE,
  MASTER_UPGRADE_DIFF,
  extraPracticeAdvice,
  extraPracticeEnd,
  extraPracticeTotal,
  nextHourStart,
  suggestMasterUpgrade,
} from "../packages/core/src/frank-extra-practice.ts";

test("ユーザー指定の条件がそのまま入っている", () => {
  assert.equal(EXTRA_PRACTICE_MINUTES, 55);
  assert.equal(EXTRA_PRACTICE_PRICE, 2750);
  assert.equal(EXTRA_PRACTICE_KIND, "extra");
  // レギュラー15,180 → マスター21,780（税込）の差額
  assert.equal(MASTER_UPGRADE_DIFF, 6600);
});

test("ユーザー提示の金額と一致する（月2枠=5,500円／月3枠=8,250円）", () => {
  assert.equal(extraPracticeTotal(2), 5500);
  assert.equal(extraPracticeTotal(3), 8250);
  assert.equal(extraPracticeTotal(0), 0);
});

test("月2枠までは据え置き、3枠からマスターをご案内する", () => {
  assert.equal(suggestMasterUpgrade(0), false);
  assert.equal(suggestMasterUpgrade(1), false);
  assert.equal(suggestMasterUpgrade(2), false); // 5,500円 < 6,600円
  assert.equal(suggestMasterUpgrade(3), true); // 8,250円 > 6,600円
  assert.equal(suggestMasterUpgrade(10), true);
});

test("0枠のときは何も言わない（使っていない方に案内を出さない）", () => {
  assert.equal(extraPracticeAdvice(0), "");
});

test("マスター会員にはマスターへの変更を勧めない", () => {
  const msg = extraPracticeAdvice(5, "マスター会員");
  assert.ok(msg.includes("今月 5枠"));
  assert.ok(!msg.includes("マスター会員への変更"));
});

test("レギュラー会員で3枠ならマスターのご案内が出る", () => {
  const msg = extraPracticeAdvice(3, "レギュラー会員");
  assert.ok(msg.includes("8,250円"));
  assert.ok(msg.includes("マスター会員への変更"));
});

test("プラチナレギュラープランもマスター扱いにはしない（名前に「マスター」が無い）", () => {
  const msg = extraPracticeAdvice(3, "プラチナレギュラープラン");
  assert.ok(msg.includes("マスター会員への変更"));
});

test("終了時刻は開始＋55分", () => {
  assert.equal(extraPracticeEnd("10:00"), "10:55");
  assert.equal(extraPracticeEnd("21:00"), "21:55");
  assert.equal(extraPracticeEnd("19:30"), "20:25");
});

test("日をまたぐ・壊れた時刻は空文字（勝手に翌日へ回さない）", () => {
  assert.equal(extraPracticeEnd("23:30"), "");
  assert.equal(extraPracticeEnd(""), "");
  assert.equal(extraPracticeEnd("あ"), "");
});

test("次の枠は「次の正時」。55分予約の終わり(10:55)からなら11:00", () => {
  assert.equal(nextHourStart("10:55"), "11:00");
  assert.equal(nextHourStart("10:30"), "11:00");
  // ちょうど正時ならその時刻のまま（11:00に終わる60分予約の次は11:00ではなく…）
  assert.equal(nextHourStart("11:00"), "11:00");
});

test("23時台から次の正時は作らない（翌日に飛ばさない）", () => {
  assert.equal(nextHourStart("23:10"), "");
  assert.equal(nextHourStart(""), "");
});
