import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * 後日決済（#217）の見分け方をここで固定する。
 * 一覧の「決済未」バッジと同じ規則（apps/member-os/src/app/(main)/frunk/page.tsx の payLater）。
 * 画面の実装を写したものなので、規則を変えるときは両方を直す。
 */
type M = { status: string; billing_status?: string | null; payment_method?: string | null };
type P = { monthly_price?: number | null } | undefined;

function payLater(m: M, plan: P): boolean {
  if (m.status !== "active") return false;
  if (!plan || Number(plan.monthly_price ?? 0) <= 0) return false;
  if (["cash", "bank", "sb_payment"].includes(String(m.payment_method ?? ""))) return false;
  return String(m.billing_status ?? "none") !== "active";
}

const plan = { monthly_price: 12000 };

test("在籍・カード未登録 → 後日決済（催促の対象）", () => {
  assert.equal(payLater({ status: "active", billing_status: "none", payment_method: "credit" }, plan), true);
  // 決済ページを開いたが払い終えていない（checkout）も対象のまま
  assert.equal(payLater({ status: "active", billing_status: "checkout", payment_method: "credit" }, plan), true);
});

test("カード登録済みは対象外（二重に案内しない）", () => {
  assert.equal(payLater({ status: "active", billing_status: "active", payment_method: "card" }, plan), false);
});

test("現金・振込・口座振替の方は対象外（催促する相手ではない）", () => {
  for (const pm of ["cash", "bank", "sb_payment"]) {
    assert.equal(payLater({ status: "active", billing_status: "none", payment_method: pm }, plan), false);
  }
});

test("月会費0円のプラン（スタッフ・モニター）は対象外", () => {
  assert.equal(payLater({ status: "active", billing_status: "none", payment_method: "credit" }, { monthly_price: 0 }), false);
  assert.equal(payLater({ status: "active", billing_status: "none", payment_method: "credit" }, undefined), false);
});

test("承認待ち・休会・退会は一覧のバッジ対象外（承認待ちは申込パネル側で出す）", () => {
  for (const st of ["pending", "suspended", "left", "rejected"]) {
    assert.equal(payLater({ status: st, billing_status: "none", payment_method: "credit" }, plan), false);
  }
});
