// Airレジ照合（money-os /airregi）の純粋関数テスト
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCsv,
  parseJournal,
  parseCashMoves,
  detectCsvKind,
  reconcile,
  matchCashOut,
  guessCategory,
  needsFill,
  similarity,
  type SaleLite,
} from "../apps/money-golfwing/src/lib/airregi.ts";

const PAY_HEAD = "現金,クレジットカード(Airペイ),クレジットカード/電子マネー(Square),ゴルフウィング金券";
const HEAD = `取引No,元取引No,取引日,取引時間,取引種別,商品名,商品単価,商品数,商品合計金額,個別割引・割増合計金額,${PAY_HEAD}`;
// 支払列は「会計の合計」が全明細行に繰り返し入る（Airレジの仕様）
const row = (tx: string, orig: string, date: string, kind: string, name: string, unit: number, qty: number, disc: number, pay: [number, number, number, number]) =>
  [tx, orig, date, "12:00:00", kind, name, unit, qty, unit * qty, disc, ...pay].join(",");

const JOURNAL = [
  HEAD,
  row("000120260906100000001", "", "2026/09/06", "会計", "P/L会員　25分", 2000, 1, 0, [2200, 0, 0, 0]),
  row("000120260906180000002", "", "2026/09/06", "会計", "KGUスクール登録料", 2000, 1, 0, [2200, 0, 0, 0]),
  row("000120260918170000003", "", "2026/09/18", "会計", "STMグリップ", 2000, 2, 0, [4400, 0, 0, 0]),
  row("000120260920110000004", "", "2026/09/20", "会計", "ZERO FIT グローブ", 1800, 1, -180, [0, 0, 1782, 0]),
  row("000120260923130000005", "", "2026/09/23", "会計", "レギュラー　１ヶ月", 17500, 2, 0, [38500, 0, 0, 0]),
  row("000120260923130100006", "", "2026/09/23", "会計", "レギュラー　１ヶ月", 17500, 2, 0, [0, 38500, 0, 0]),
  row("000120261001100000007", "000120260923130000005", "2026/10/01", "返品", "レギュラー　１ヶ月", 17500, 2, 0, [38500, 0, 0, 0]),
  row("000120260913180000008", "", "2026/09/13", "会計", "P/L会員　25分", 2000, 1, 0, [0, 2200, 0, 0]),
].join("\r\n");

const sale = (p: Partial<SaleLite> & { id: string; soldOn: string; amount: number }): SaleLite => ({
  payMethod: "現金", productName: null, qty: 1, listPrice: null, discount: null, customerName: "テスト", ...p,
});

test("parseCsv: 引用符・セル内改行・\"\"エスケープ", () => {
  const r = parseCsv('a,b\r\n"x\r\ny","he said ""hi"""\r\n');
  assert.deepEqual(r, [["a", "b"], ["x\r\ny", 'he said "hi"']]);
});

test("parseJournal: 税抜・割引後の金額と支払方法", () => {
  const lines = parseJournal(JOURNAL);
  assert.equal(lines.length, 8);
  const glove = lines.find((l) => l.productName.includes("ZERO"))!;
  assert.equal(glove.net, 1620);
  assert.equal(glove.pay, "Square");
  assert.equal(lines.find((l) => l.kind === "返品")!.origTxNo, "000120260923130000005");
  assert.equal(detectCsvKind(JOURNAL), "journal");
});

test("parseCashMoves: 0円の空打ちは捨て、出金はマイナス", () => {
  const csv = [
    "店舗番号,店舗名,レジID,レジ担当者ID,レジ担当者名,営業日,取引日時,入出金タイプ,入出金額,コメント",
    'X,"GW",1,1,"未設定",2026/09/11,2026/09/11 17:03:53,出金,0,""',
    'X,"GW",1,1,"未設定",2026/09/13,2026/09/13 16:25:56,出金,-200,"印刷代\n"',
  ].join("\r\n");
  const m = parseCashMoves(csv);
  assert.equal(m.length, 1);
  assert.deepEqual(m[0], { occurredAt: "2026-09-13 16:25:56", bizDate: "2026-09-13", kind: "出金", amount: -200, comment: "印刷代" });
  assert.equal(detectCsvKind(csv), "cash");
});

test("reconcile: 漏れ・余分・支払違い・個数違い・返品の打ち消し", () => {
  const sales: SaleLite[] = [
    // 同じ日に同額2,000が2件。品名で正しい相手を選ぶ（先着だと取り違える）
    sale({ id: "kgu", soldOn: "2026-09-06", amount: 2000, payMethod: "現金", productName: "KGUスクール登録料" }),
    sale({ id: "pl", soldOn: "2026-09-06", amount: 2000, payMethod: "Square", productName: "パーソナルレッスン２５分" }),
    // 個数の打ち間違い（2本を1本）
    sale({ id: "stm", soldOn: "2026-09-18", amount: 2000, productName: null, qty: 1, listPrice: 2000 }),
    // 打ち直しのほう（Airペイ）だけ money-os にある
    sale({ id: "reg", soldOn: "2026-09-23", amount: 35000, payMethod: "Airペイ", qty: 2 }),
    // 支払方法違い
    sale({ id: "pas", soldOn: "2026-09-13", amount: 2000, payMethod: "現金", productName: "パーソナルレッスン２５分" }),
    // Airレジに無い
    sale({ id: "ext", soldOn: "2026-09-14", amount: 4000, payMethod: "Square", productName: "休会事務手数料" }),
  ];
  const r = reconcile(parseJournal(JOURNAL), sales);
  assert.deepEqual(r.missing.map((l) => l.productName), ["ZERO FIT グローブ"]);
  assert.deepEqual(r.extra.map((s) => s.id), ["ext"]);
  assert.deepEqual(r.cancelled.map((l) => l.txNo), ["000120260923130000005"]);

  const byId = new Map(r.pairs.map((p) => [p.sale.id, p]));
  assert.equal(byId.get("kgu")!.air.productName, "KGUスクール登録料");
  assert.equal(byId.get("pl")!.payOk, false); // Airレジは現金
  assert.equal(byId.get("pas")!.payOk, false); // Airレジは Airペイ
  assert.equal(byId.get("stm")!.amountOk, false);
  assert.equal(byId.get("stm")!.air.qty, 2);
  assert.equal(byId.get("reg")!.payOk, true);
  assert.equal(r.airTotal, 2000 + 2000 + 4000 + 1620 + 35000 + 2000);
});

test("reconcile: 会計を開いた日と締めた日がずれても結ぶ（取引Noの日付）", () => {
  const csv = [HEAD, row("000120260914191313050", "", "2026/09/16", "会計", "P/L会員　25分", 2000, 2, 0, [0, 4400, 0, 0])].join("\n");
  const r = reconcile(parseJournal(csv), [sale({ id: "a", soldOn: "2026-09-14", amount: 4000, payMethod: "Airペイ" })]);
  assert.equal(r.pairs.length, 1);
});

test("matchCashOut: 金額一致・3日以内の店の現金の経費と結ぶ", () => {
  const moves = [
    { occurredAt: "2026-09-13 16:25:56", bizDate: "2026-09-13", kind: "出金" as const, amount: -200, comment: "印刷代" },
    { occurredAt: "2026-09-24 12:49:27", bizDate: "2026-09-24", kind: "出金" as const, amount: -220, comment: "ヘアゴム" },
  ];
  const m = matchCashOut(moves, [{ id: "e1", spentOn: "2026-09-14", amount: 200, method: "cash", item: "印刷" }]);
  assert.equal(m[0].expense?.id, "e1");
  assert.equal(m[1].expense, null);
});

test("guessCategory / needsFill / similarity", () => {
  assert.equal(guessCategory("レギュラー　１ヶ月"), "月会費(窓口)");
  assert.equal(guessCategory("P/L会員　25分"), "利用料");
  assert.equal(guessCategory("55分(ビジター)"), "利用料");
  assert.equal(guessCategory("ZERO FIT グローブ"), "販売");
  assert.deepEqual(needsFill({ customerName: null, memberKind: "会員", productName: "x", memo: "【要確認】Airレジから追加" }), ["お客様名", "要確認メモ"]);
  assert.ok(similarity("P/L会員　25分", "パーソナルレッスン２５分") > similarity("P/L会員　25分", "KGUスクール登録料"));
});

/* ---------------- 文章型レポート ---------------- */
import { buildReport, productConflict, expectedCategory, type ReportSale } from "../apps/money-golfwing/src/lib/airregi-report.ts";

const rs = (p: Partial<ReportSale> & { id: string; soldOn: string; amount: number }): ReportSale => ({
  payMethod: "現金", productName: null, qty: 1, listPrice: null, discount: null, customerName: "テスト",
  category: "販売", memberKind: "会員", itemType: null, maker: null, memo: null, ...p,
});

test("buildReport: 合計・差額の説明・A〜E・備考", () => {
  const sales: ReportSale[] = [
    rs({ id: "kgu", soldOn: "2026-09-06", amount: 2000, productName: "KGUスクール登録料", category: "利用料" }),
    rs({ id: "pl", soldOn: "2026-09-06", amount: 2000, payMethod: "Square", productName: "パーソナルレッスン２５分", category: "利用料", customerName: "吉川" }),
    rs({ id: "stm", soldOn: "2026-09-18", amount: 2000, qty: 1, listPrice: 2000, customerName: "豊田", memberKind: null }),
    rs({ id: "reg", soldOn: "2026-09-23", amount: 35000, payMethod: "Airペイ", qty: 2, category: "月会費(窓口)", productName: "レギュラー月会費" }),
    rs({ id: "pas", soldOn: "2026-09-13", amount: 2000, productName: "パーソナルレッスン２５分", category: "利用料" }),
    rs({ id: "ext", soldOn: "2026-09-14", amount: 4000, payMethod: "Square", productName: "休会事務手数料", category: "利用料", customerName: "浅田" }),
  ];
  const rep = buildReport({
    storeName: "テスト店",
    ym: "2026-09",
    lines: parseJournal(JOURNAL),
    sales,
    cashMoves: [{ occurredAt: "2026-09-13 16:25:56", bizDate: "2026-09-13", kind: "出金", amount: -200, comment: "印刷代" }],
    expenses: [],
  });
  assert.match(rep.title, /^9月 テスト店：Airレジ × money-os 突き合わせ結果$/);
  // Air: 2000+2000+4000+1620+35000+2000 = 46,620 ／ money: 47,000
  assert.match(rep.summary[0], /Airレジ 46,620円.*money-os 47,000円 → 差額 380円（money-os が多い）/);
  assert.match(rep.summary[1], /全部説明がつきます/);
  const keys = rep.sections.map((s) => s.key);
  assert.deepEqual(keys, ["A", "B", "C", "D", "E", "Z"]);
  const A = rep.sections[0];
  assert.equal(A.rows.length, 2);
  assert.match(A.rows[0].cells[1], /豊田様の会計の STMグリップ 2個 → money-osは1個/);
  assert.match(rep.text, /会員区分が空欄：9\/18 豊田様/);
  assert.match(rep.text, /9\/23 の現金「レギュラー　１ヶ月」35,000円は 10\/1 に返品/);
  assert.match(rep.text, /計 200円。9月の money-os 経費は0件です。/);
});

test("buildReport: 何も無ければ「すべて合っています」", () => {
  const csv = [HEAD, row("000120260905100000001", "", "2026/09/05", "会計", "P/L会員　25分", 2000, 1, 0, [2200, 0, 0, 0])].join("\n");
  const rep = buildReport({
    storeName: "店", ym: "2026-09", lines: parseJournal(csv),
    sales: [rs({ id: "a", soldOn: "2026-09-05", amount: 2000, productName: "パーソナルレッスン２５分", category: "利用料" })],
    cashMoves: [], expenses: [],
  });
  assert.equal(rep.ok, true);
  assert.match(rep.text, /すべて合っています/);
});

test("productConflict / expectedCategory", () => {
  assert.equal(productConflict("Tour velvet ALIGN STD", "MCC+4ALIGN  STD (有)", "GOLF PRIDE"), true);
  assert.equal(productConflict("Tour velvet", "Tour Velvet (無)"), false);
  assert.equal(productConflict("USTマミヤ", "ATTAS SPEED F-2", "USTマミヤ"), false);
  assert.equal(productConflict("Iomic グリップ", "sticky 1.8", "IOMIC"), false);
  assert.equal(productConflict("フジクラ", "SPEEDER"), false); // カナだけは判定しない
  assert.equal(expectedCategory({ itemType: "グローブ", productName: null }, null), "販売");
  assert.equal(expectedCategory({ itemType: null, productName: null }, "110分(ビジター)"), "利用料");
  assert.equal(expectedCategory({ itemType: "月会費（定額制）", productName: null }, null), null);
});
