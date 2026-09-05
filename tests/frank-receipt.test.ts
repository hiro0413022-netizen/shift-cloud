import { test } from "node:test";
import assert from "node:assert/strict";
import { saleLabel, receiptNo, type SaleRow } from "../apps/member-os/src/lib/frank-receipt-pure.ts";
import { signAdminPayload, verifyAdminPayload } from "@yozan/core/admin-sign";

const row = (over: Partial<SaleRow> = {}): SaleRow => ({
  id: "aaaa1111-2222-3333-4444-555566667777",
  sold_on: "2026-09-05",
  category: "月会費",
  amount_inc_tax: 30360,
  pay_method: "クレジットカード",
  months: null,
  ...over,
});

test("前受け（2ヶ月分）は但し書きだけでなく内訳にも月数を出す", () => {
  assert.equal(saleLabel(row({ months: 2 }), "レギュラー会員"), "月会費（レギュラー会員・2ヶ月分）");
});

test("1ヶ月ぶんは受領月を出す（いつの分か分からない領収書を作らない）", () => {
  assert.equal(saleLabel(row({ months: 1 }), "レギュラー会員"), "月会費（レギュラー会員・2026年9月分）");
  assert.equal(saleLabel(row(), null), "月会費（2026年9月分）");
});

test("入会金はプラン名だけ添える", () => {
  assert.equal(saleLabel(row({ category: "入会金" }), "レギュラー会員"), "入会金（レギュラー会員）");
});

test("領収書番号は同じ入金の組み合わせなら毎回同じ（再発行で番号が増えない）", () => {
  const a = receiptNo("FR0013", ["aaaa1111-x", "bbbb2222-y"]);
  const b = receiptNo("FR0013", ["bbbb2222-y", "aaaa1111-x"]); // 並び順が違っても同じ
  assert.equal(a, b);
  assert.match(a, /^FR0013-/);
  assert.notEqual(a, receiptNo("FR0014", ["aaaa1111-x", "bbbb2222-y"]));
});

test("アプリ間の署名: 期限内の正しい署名だけ通る", () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key-for-signing";
  const payload = JSON.stringify({ toName: "小西 貴之 様", items: [{ label: "月会費", amount: 30360 }] });
  const exp = Date.now() + 60_000;
  const sig = signAdminPayload(payload, exp);

  assert.equal(verifyAdminPayload(payload, exp, sig), true);
  // 本文を1文字でも変えたら通らない（金額の書き換え防止）
  assert.equal(verifyAdminPayload(payload.replace("30360", "99999"), exp, sig), false);
  // 期限切れは通らない
  assert.equal(verifyAdminPayload(payload, Date.now() - 1, signAdminPayload(payload, Date.now() - 1)), false);
  // 署名なしは通らない
  assert.equal(verifyAdminPayload(payload, exp, ""), false);
});
