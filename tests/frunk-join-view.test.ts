import test from "node:test";
import assert from "node:assert/strict";
import { joinPaymentView } from "../apps/member-os/src/lib/frunk-join-view.ts";

/* ============================================================
   入会申込（承認待ち）の決済表示（#188）
   「決済していなくても承認できてしまう」ので、承認ボタンの手前に何を出すかを固定する。
   ============================================================ */

test("入金を受信済み（billing_status=active）は「確認済み」で注意書きを出さない", () => {
  const v = joinPaymentView({ billing_status: "active" });
  assert.equal(v.tone, "ok");
  assert.equal(v.note, "");
});

test("決済ページまで進んだまま（checkout）は警告し、請求予定額を文面に出す", () => {
  const v = joinPaymentView({ billing_status: "checkout", square_checkout_breakdown: { total: 13200 } });
  assert.equal(v.tone, "warn");
  assert.equal(v.expected, 13200);
  assert.match(v.note, /13,200円/);
  assert.match(v.note, /Squareで入金を確認/);
});

test("決済リンク未発行（店頭入会）は警告ではなく案内にする", () => {
  const v = joinPaymentView({ billing_status: "none", payment_method: "cash" });
  assert.equal(v.tone, "info");
  assert.equal(v.expected, 0);
});

test("billing_status が空でも落ちない", () => {
  assert.equal(joinPaymentView({}).tone, "info");
});
