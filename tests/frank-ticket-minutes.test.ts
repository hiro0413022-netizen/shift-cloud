// レッスンの長さぶんのチケット・購入ぶんの判定（#328・2026-10-01）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ticketsForMinutes,
  paidQtyForUse,
  TICKET_INCENTIVE_UNIT_PRICE,
  type TicketLedgerRow,
} from "../packages/core/src/frank-lesson-tickets.ts";

test("1枚=25分。50分なら2枚（林さんの報告の件）", () => {
  assert.equal(ticketsForMinutes(25), 1);
  assert.equal(ticketsForMinutes(50), 2);
  assert.equal(ticketsForMinutes(75), 3);
});

test("端数は切り上げ（30分を1枚にしない）", () => {
  assert.equal(ticketsForMinutes(30), 2);
  assert.equal(ticketsForMinutes(26), 2);
  assert.equal(ticketsForMinutes(24), 1);
});

test("おかしな値でも1枚は返す（0枚で確定させない）", () => {
  assert.equal(ticketsForMinutes(0), 1);
  assert.equal(ticketsForMinutes(-10), 1);
  assert.equal(ticketsForMinutes(NaN), 1);
});

test("1枚の分数を変えても計算が付いてくる", () => {
  assert.equal(ticketsForMinutes(50, 50), 1);
  assert.equal(ticketsForMinutes(100, 50), 2);
});

/* ---------------- 購入ぶんの引き当て（インセンティブの対象枚数） ---------------- */

const row = (kind: TicketLedgerRow["kind"], qty: number, d: string): TicketLedgerRow =>
  ({ kind, qty, created_at: `2026-09-${d}T00:00:00Z` });

test("無料付与だけを使ってもインセンティブは出ない（本田様の実例）", () => {
  // 9月入会キャンペーンの2枚だけを持っている方が50分（2枚）使った
  const ledger = [row("grant", 2, "27")];
  assert.equal(paidQtyForUse(ledger, 2), 0);
});

test("購入したぶんを使ったら枚数ぶん出る", () => {
  const ledger = [row("purchase", 4, "10")];
  assert.equal(paidQtyForUse(ledger, 1), 1);
  assert.equal(paidQtyForUse(ledger, 2), 2);
});

test("古い順に引き当てる（無料が先にあれば先に減る）", () => {
  const ledger = [row("grant", 2, "01"), row("purchase", 4, "10")];
  assert.equal(paidQtyForUse(ledger, 2), 0); // 無料2枚ぶん
  assert.equal(paidQtyForUse(ledger, 3), 1); // 無料2＋購入1
  assert.equal(paidQtyForUse(ledger, 6), 4); // 無料2＋購入4
});

test("すでに使ったぶんは飛ばして数える", () => {
  const ledger = [row("grant", 2, "01"), row("purchase", 2, "10"), row("use", -2, "20")];
  // 無料2枚は使用済み → 次の2枚は購入ぶん
  assert.equal(paidQtyForUse(ledger, 2), 2);
  assert.equal(paidQtyForUse(ledger, 1), 1);
});

test("残りより多く使おうとしても、ある枚数ぶんしか数えない", () => {
  const ledger = [row("purchase", 1, "10")];
  assert.equal(paidQtyForUse(ledger, 5), 1);
});

test("並び順がバラバラでも古い順に直して数える", () => {
  const ledger = [row("purchase", 1, "20"), row("grant", 1, "01")];
  assert.equal(paidQtyForUse(ledger, 1), 0); // 9/01の無料が先
  assert.equal(paidQtyForUse(ledger, 2), 1);
});

test("0枚・台帳が空なら0", () => {
  assert.equal(paidQtyForUse([], 3), 0);
  assert.equal(paidQtyForUse([row("purchase", 3, "10")], 0), 0);
});

test("インセンティブ単価は1,000円（2026-10-01 ユーザー決定）", () => {
  assert.equal(TICKET_INCENTIVE_UNIT_PRICE, 1000);
  // 50分（購入2枚）なら2,000円
  assert.equal(paidQtyForUse([row("purchase", 2, "10")], 2) * TICKET_INCENTIVE_UNIT_PRICE, 2000);
});
