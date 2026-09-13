import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  verifySquareSignature,
  paySourceLabel,
  exTax,
  jstDateOf,
  mapSquarePayment,
  mapSquareRefund,
  monthlyFeeTaxIncluded,
  toE164Jp,
  classifySquareMonthlyPayment,
} from "../apps/genesis/src/lib/frank-pos-pure.ts";
import { buildTrialConfirmMail, buildReminderMail } from "../apps/genesis/src/lib/frank-mail-pure.ts";

/* ============================================================
   FRANK GOLF Square POS連携（#118 / 実行計画§3-7）
   Webhookで受けた店頭決済を Money OS(mon_sales) の行へ読み替える。
   外から来る値の読み替えはネットワーク無しで固定する（#113の教訓）。
   ============================================================ */

const URL = "https://yozan-genesis.vercel.app/api/public/frank/pos/webhook";
const KEY = "test-signature-key";
const sign = (body: string) => createHmac("sha256", KEY).update(URL + body).digest("base64");

test("Square署名: 正しい署名は通る", () => {
  const body = JSON.stringify({ type: "payment.updated" });
  assert.equal(verifySquareSignature(body, sign(body), KEY, URL), true);
});

test("Square署名: 本文改ざん・鍵違い・URL違い・ヘッダ無しは弾く", () => {
  const body = JSON.stringify({ type: "payment.updated" });
  const sig = sign(body);
  assert.equal(verifySquareSignature(body + " ", sig, KEY, URL), false);
  assert.equal(verifySquareSignature(body, sig, "wrong-key", URL), false);
  assert.equal(verifySquareSignature(body, sig, KEY, "https://example.com/hook"), false);
  assert.equal(verifySquareSignature(body, null, KEY, URL), false);
});

test("税込→税抜: Money OS(floor)・Stripe月会費(round)の両方の作り方と往復一致する", () => {
  // Money OS: 税込 = floor(税抜 × 1.1)
  for (const ex of [1000, 3000, 2727, 555]) {
    assert.equal(exTax(Math.floor(ex * 1.1)), ex);
  }
  // Stripe月会費: unit_amount = round(税抜 × 1.1)（frunk_plansの3プラン）
  for (const ex of [9800, 13800, 19800]) {
    assert.equal(exTax(Math.round(ex * 1.1)), ex);
  }
});

test("sold_on はJSTの日付（UTC夕方の決済が前日にならない）", () => {
  // UTC 9/1 16:00 = JST 9/2 01:00
  assert.equal(jstDateOf("2026-09-01T16:00:00Z"), "2026-09-02");
  assert.equal(jstDateOf("2026-09-02T10:00:00+09:00"), "2026-09-02");
});

test("支払いマッピング: COMPLETEDのみ・現金ラベル・金額の税抜化", () => {
  const p = {
    id: "PAY1",
    status: "COMPLETED",
    amount_money: { amount: 3300, currency: "JPY" },
    source_type: "CASH",
    created_at: "2026-09-02T01:00:00+09:00",
    note: "体験レッスン",
  };
  const m = mapSquarePayment(p);
  assert.ok(m);
  assert.equal(m.amount, 3000);
  assert.equal(m.tax_included, 3300);
  assert.equal(m.pay_method, "現金");
  assert.equal(m.category, "利用料");
  assert.equal(m.sold_on, "2026-09-02");
  assert.match(String(m.memo), /体験レッスン/);
  // 未完了・0円・外貨・id無しは記録しない
  assert.equal(mapSquarePayment({ ...p, status: "APPROVED" }), null);
  assert.equal(mapSquarePayment({ ...p, amount_money: { amount: 0, currency: "JPY" } }), null);
  assert.equal(mapSquarePayment({ ...p, amount_money: { amount: 100, currency: "USD" } }), null);
  assert.equal(mapSquarePayment({ ...p, id: undefined }), null);
});

test("支払い方法ラベル: source_typeを日本語へ（不明はSquare）", () => {
  assert.equal(paySourceLabel("CARD"), "カード");
  assert.equal(paySourceLabel("WALLET"), "QR決済");
  assert.equal(paySourceLabel("SOMETHING_NEW"), "Square");
  assert.equal(paySourceLabel(undefined), "Square");
});

test("返金マッピング: マイナスの売上行（category=返金）になる", () => {
  const r = mapSquareRefund({
    id: "REF1",
    status: "COMPLETED",
    amount_money: { amount: 1100, currency: "JPY" },
    created_at: "2026-09-03T12:00:00+09:00",
  });
  assert.ok(r);
  assert.equal(r.amount, -1000);
  assert.equal(r.tax_included, -1100);
  assert.equal(r.category, "返金");
  assert.equal(mapSquareRefund({ id: "REF2", status: "PENDING", amount_money: { amount: 100 } }), null);
});

/* ============================================================
   月会費のSquare一本化（#123）
   同じWebhookに月会費と店頭売上が届く＝振り分けを間違えると
   二重計上（月会費が「利用料」にもなる）や取りこぼしが起きる。
   ============================================================ */

test("月会費の税込額: round(税抜×1.1)＝exTaxと往復一致（全5プラン）", () => {
  for (const ex of [9800, 13800, 19800, 39800, 59800]) {
    const incl = monthlyFeeTaxIncluded(ex);
    assert.equal(exTax(incl), ex);
  }
  assert.equal(monthlyFeeTaxIncluded(9800), 10780);
});

test("電話番号→E.164: 0始まりは+81へ・変換できなければnull（省略）", () => {
  assert.equal(toE164Jp("090-1234-5678"), "+819012345678");
  assert.equal(toE164Jp("0791 22 3344"), "+81791223344");
  assert.equal(toE164Jp("+81 90 1234 5678"), "+819012345678");
  assert.equal(toE164Jp("1234"), null);
  assert.equal(toE164Jp(null), null);
});

test("月会費の振り分け: 注文ID一致=初回・顧客ID一致は金額がプラン税込月額のときだけ継続", () => {
  // 初回（決済リンクの注文IDが一致）は金額に関係なく月会費
  assert.equal(classifySquareMonthlyPayment({ orderMatched: true, customerMatched: false, amount: 10780, planTaxIncluded: 10780 }), "initial");
  // 継続課金: 顧客ID一致＋プラン税込月額と同額
  assert.equal(classifySquareMonthlyPayment({ orderMatched: false, customerMatched: true, amount: 15180, planTaxIncluded: 15180 }), "recurring");
  // 会員が店頭で会員価格ドリンク（400円）を買っても月会費と誤記録しない
  assert.equal(classifySquareMonthlyPayment({ orderMatched: false, customerMatched: true, amount: 400, planTaxIncluded: 15180 }), null);
  // 会員でも注文でもない＝店頭売上（POS経路）
  assert.equal(classifySquareMonthlyPayment({ orderMatched: false, customerMatched: false, amount: 10780, planTaxIncluded: null }), null);
  // モニター会員（月会費0円＝planTaxIncluded null）は継続課金と判定しない
  assert.equal(classifySquareMonthlyPayment({ orderMatched: false, customerMatched: true, amount: 10780, planTaxIncluded: null }), null);
});

/* ============================================================
   お客様向けメール文面（#118）
   確認メールは「キャンセルURLの唯一の控え」なのでURLの形を固定する。
   ============================================================ */

test("体験確認メール: キャンセルURL・日時・打席が入る", () => {
  const m = buildTrialConfirmMail({
    name: "山田太郎",
    date: "2026-09-05",
    start: "10:00",
    end: "11:00",
    bayName: "A打席",
    cancelToken: "abc123",
  });
  assert.match(m.subject, /2026年9月5日（土） 10:00〜/);
  assert.match(m.text, /https:\/\/frankgolf\.jp\/trial-booking\.html\?cancel=abc123/);
  assert.match(m.text, /A打席/);
  assert.match(m.text, /山田太郎 様/);
});

test("前日リマインダー: キャンセルURLは体験のみ（会員予約には出さない）", () => {
  const trial = buildReminderMail({
    name: "山田",
    kind: "体験レッスン",
    date: "2026-09-05",
    start: "10:00",
    end: "11:00",
    cancelUrl: "https://frankgolf.jp/trial-booking.html?cancel=abc",
  });
  assert.match(trial.text, /cancel=abc/);
  const member = buildReminderMail({ name: "小川", kind: "打席のご予約", date: "2026-09-05", start: "18:00", end: "19:00" });
  assert.ok(!member.text.includes("cancel="));
});
