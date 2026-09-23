import test from "node:test";
import assert from "node:assert/strict";
import { orderNotifyText } from "../packages/core/src/frank-order-notify.ts";
import { redactNames } from "../packages/core/src/line-redact.ts";

/* ドリンク注文のLINE文面（#273）。通知の1行目だけで動けることを守る */

test("1行目に打席、そのあと品目・金額", () => {
  const t = orderNotifyText({
    orderNo: "0924-03",
    bayName: "B打席",
    isMember: true,
    lines: [
      { name: "コーヒー", qty: 2 },
      { name: "スポーツドリンク", qty: 1 },
    ],
    total: 1100,
    settlement: "oncard",
  });
  const rows = t.split("\n");
  assert.match(rows[0], /^🥤 ドリンクのご注文（B打席）$/);
  assert.equal(rows[1], "・コーヒー ×2");
  assert.equal(rows[2], "・スポーツドリンク ×1");
  assert.match(t, /¥1,100／カードに自動決済／会員/);
  assert.match(t, /伝票 0924-03/);
});

test("打席が無いときも「どこか」を必ず書く", () => {
  const t = orderNotifyText({ orderNo: "0924-04", bayName: null, isMember: false, lines: [{ name: "水", qty: 1 }], total: 200, settlement: "register" });
  assert.match(t.split("\n")[0], /打席の指定なし/);
  assert.match(t, /¥200／退店時にレジ／ビジター/);
});

test("決済の前に送るので「決済済み」とは書かない（あとで失敗しても嘘にならない）", () => {
  const t = orderNotifyText({ orderNo: "1", bayName: "A", isMember: true, lines: [{ name: "茶", qty: 1 }], total: 100, settlement: "oncard" });
  assert.ok(!t.includes("決済済み"));
});

test("伝票URLがあれば末尾に付く", () => {
  const t = orderNotifyText({
    orderNo: "1",
    bayName: "A",
    isMember: true,
    lines: [{ name: "茶", qty: 1 }],
    total: 100,
    settlement: "oncard",
    ordersUrl: "https://example.test/orders",
  });
  assert.equal(t.split("\n").at(-1), "https://example.test/orders");
});

test("数量0の行は出さない", () => {
  const t = orderNotifyText({
    orderNo: "1",
    bayName: "A",
    isMember: true,
    lines: [
      { name: "茶", qty: 0 },
      { name: "水", qty: 1 },
    ],
    total: 100,
    settlement: "register",
  });
  assert.ok(!t.includes("茶"));
  assert.ok(t.includes("・水 ×1"));
});

test("お客様のお名前は文面に入らない（渡す口が無い）", () => {
  const t = orderNotifyText({ orderNo: "1", bayName: "A", isMember: true, lines: [{ name: "茶", qty: 1 }], total: 100, settlement: "oncard" });
  assert.ok(!/様/.test(t));
});

test("伏せ字（#243）は送信口で通る＝品名にスタッフ名が混ざっても出ない", () => {
  const t = orderNotifyText({ orderNo: "1", bayName: "藤田 晃規", isMember: true, lines: [{ name: "茶", qty: 1 }], total: 100, settlement: "oncard" });
  assert.ok(!redactNames(t, ["藤田　晃規"]).includes("藤田"));
});
