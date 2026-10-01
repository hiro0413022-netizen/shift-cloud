// airregi.ts — Airレジ CSV と money-os の突き合わせ（純粋関数・DBアクセス禁止・server-only禁止）
//
// ユーザー依頼（2026-10-01）「money-os で Airレジのデータと突き合わせて漏れや誤りがないかをチェックしたい。
//   基本的には Airレジのほうが正しいが打ち間違いもある。商品の詳細は Airレジに無いので、
//   漏れがあったら money-os で要確認を出して名前や商品名をスタッフに記入させたい」
//
// 方針
//   - Airレジ＝「いくら・何を・何で払ったか」の正。money-os＝「誰が・どの商品か」の正。
//   - 突き合わせは「明細1行 ↔ 売上1行」。金額（税抜・割引後）一致を軸に、
//     日付の近さ → 支払方法の一致 → 品名の似かた の順で、全組み合わせから良い順に結ぶ（貪欲法）。
//     1件ずつ先着で結ぶと、同じ日の同額（パーソナル2,000円が何件も）で相手を取り違える（9月照合で実際に起きた）。
//   - 金額が合わない行は「同じ日付近・同じ単価」で2段目の結びを試す（＝個数の打ち間違い）。
//   - 返品は元取引No の明細を打ち消す（同額の打ち直し→返品、が実際にある）。
//
// tests/airregi.test.ts から直接 import してテストする。

/* ------------------------------------------------------------------ CSV */

/** RFC4180 風の CSV パーサ（"" エスケープ・セル内改行に対応） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
      continue;
    }
    if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); if (row.length > 1 || row[0] !== "") rows.push(row); }
  return rows;
}

function toObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const num = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const ymd = (v: string | undefined) => String(v ?? "").trim().replace(/\//g, "-").slice(0, 10);

/** money-os の支払方法名へ寄せる（Airレジの列名 → money-os の選択肢） */
export const AIR_PAY_COLUMNS: { col: string; pay: string }[] = [
  { col: "現金", pay: "現金" },
  { col: "クレジットカード(Airペイ)", pay: "Airペイ" },
  { col: "QR決済(Airペイ QR)", pay: "Airペイ" },
  { col: "QR決済(Airペイ)", pay: "Airペイ" },
  { col: "交通系電子マネー(Airペイ)", pay: "Airペイ" },
  { col: "iD(Airペイ)", pay: "Airペイ" },
  { col: "QUICPay(Airペイ)", pay: "Airペイ" },
  { col: "Apple Pay(Airペイ)", pay: "Airペイ" },
  { col: "クレジットカード(Airペイ タッチ)", pay: "Airペイ" },
  { col: "楽天Edy(Airペイ)", pay: "Airペイ" },
  { col: "UnionPay 銀聯(Airペイ)", pay: "Airペイ" },
  { col: "ポイント(Airペイ ポイント)", pay: "Airペイ" },
  { col: "クレジットカード/電子マネー(Square)", pay: "Square" },
  { col: "Squre（請求書払い）", pay: "Square" },
  { col: "スクエア", pay: "Square" },
  { col: "ゴルフウィング金券", pay: "金券" },
  { col: "ゴルフウィング　クーポン", pay: "金券" },
  { col: "銀行振込（請求書払い）", pay: "振込" },
  { col: "PayPay（QR）", pay: "その他" },
  { col: "クレジット（pcat）", pay: "その他" },
];

export type AirLine = {
  txNo: string;
  origTxNo: string | null;
  lineNo: number;
  kind: "会計" | "返品";
  txDate: string; // YYYY-MM-DD（取引日＝会計を締めた日）
  txTime: string;
  productName: string;
  unitPrice: number;
  qty: number;
  /** 税抜・個別割引後（＝ money-os の amount と同じ物差し） */
  net: number;
  /** 支払方法（money-os の表記）。併用は "/" 区切り（例 "現金/金券"） */
  pay: string;
};

export type AirCash = {
  occurredAt: string; // "YYYY-MM-DD HH:MM:SS"
  bizDate: string;
  kind: "入金" | "出金";
  amount: number; // 出金はマイナス
  comment: string;
};

/** ジャーナル履歴 CSV（取引No…お預り金額,おつり金額 の横長形式）を明細行に */
export function parseJournal(text: string): AirLine[] {
  const objs = toObjects(text);
  if (objs.length > 0 && !("取引No" in objs[0] && "商品名" in objs[0])) {
    throw new Error("ジャーナル履歴のCSVではないようです（「取引No」「商品名」の列がありません）");
  }
  const seen = new Map<string, number>();
  const out: AirLine[] = [];
  for (const o of objs) {
    const txNo = o["取引No"];
    if (!txNo) continue;
    const lineNo = (seen.get(txNo) ?? 0) + 1;
    seen.set(txNo, lineNo);
    const pays = Array.from(new Set(AIR_PAY_COLUMNS.filter((p) => num(o[p.col]) !== 0).map((p) => p.pay)));
    out.push({
      txNo,
      origTxNo: o["元取引No"] || null,
      lineNo,
      kind: o["取引種別"] === "返品" ? "返品" : "会計",
      txDate: ymd(o["取引日"]),
      txTime: o["取引時間"] ?? "",
      productName: (o["商品名"] ?? "").trim(),
      unitPrice: num(o["商品単価"]),
      qty: num(o["商品数"]) || 1,
      net: num(o["商品合計金額"]) + num(o["個別割引・割増合計金額"]),
      pay: pays.join("/"),
    });
  }
  return out;
}

/** 入出金履歴 CSV。金額0の行（レジ開け等の空打ち）は捨てる */
export function parseCashMoves(text: string): AirCash[] {
  const objs = toObjects(text);
  if (objs.length > 0 && !("入出金タイプ" in objs[0])) {
    throw new Error("入出金履歴のCSVではないようです（「入出金タイプ」の列がありません）");
  }
  return objs
    .map((o) => ({
      occurredAt: String(o["取引日時"] ?? "").replace(/\//g, "-"),
      bizDate: ymd(o["営業日"] || o["取引日時"]),
      kind: (o["入出金タイプ"] === "入金" ? "入金" : "出金") as AirCash["kind"],
      amount: num(o["入出金額"]),
      comment: (o["コメント"] ?? "").replace(/\s+/g, " ").trim(),
    }))
    .filter((c) => c.amount !== 0 && c.occurredAt);
}

/** どちらのCSVかを列名で見分ける */
export function detectCsvKind(text: string): "journal" | "cash" | null {
  const head = (parseCsv(text.slice(0, 4000))[0] ?? []).join(",");
  if (head.includes("取引No") && head.includes("商品名")) return "journal";
  if (head.includes("入出金タイプ")) return "cash";
  return null;
}

/* ------------------------------------------------------------------ 返品 */

/**
 * 返品を元の明細に当てて、両方を「取消」として外す。
 * 元取引No の中で 品名・個数・金額が同じ行を1つ消す（無ければ同額の行）。
 * @returns 取消された明細のキー（txNo#lineNo）の集合
 */
export function cancelledKeys(lines: AirLine[]): Set<string> {
  const out = new Set<string>();
  for (const r of lines.filter((l) => l.kind === "返品")) {
    out.add(lineKey(r));
    if (!r.origTxNo) continue;
    const cands = lines.filter((l) => l.kind === "会計" && l.txNo === r.origTxNo && !out.has(lineKey(l)));
    const hit =
      cands.find((l) => l.productName === r.productName && l.qty === r.qty && l.net === Math.abs(r.net)) ??
      cands.find((l) => l.net === Math.abs(r.net));
    if (hit) out.add(lineKey(hit));
  }
  return out;
}

export const lineKey = (l: { txNo: string; lineNo: number }) => `${l.txNo}#${l.lineNo}`;

/* ------------------------------------------------------------------ 突き合わせ */

export type SaleLite = {
  id: string;
  soldOn: string;
  amount: number;
  payMethod: string | null;
  productName: string | null;
  qty: number | null;
  listPrice: number | null;
  discount: number | null;
  customerName: string | null;
};

export type ExpenseLite = { id: string; spentOn: string; amount: number; method: string | null; item: string | null };

/** 表記ゆれを吸収（全角半角・空白・記号・大小文字） */
export function normName(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　・\-ー－_()（）\[\]【】/／.,、。]/g, "")
    .replace(/p\/?l会員/g, "パーソナルレッスン");
}

/** 文字2-gram の Dice 係数（0〜1）。品名の「似ている度」 */
export function similarity(a: string | null | undefined, b: string | null | undefined): number {
  const x = normName(a), y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.8;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const gx = grams(x), gy = grams(y);
  let inter = 0, nx = 0, ny = 0;
  for (const v of gx.values()) nx += v;
  for (const v of gy.values()) ny += v;
  for (const [k, v] of gx) inter += Math.min(v, gy.get(k) ?? 0);
  return nx + ny === 0 ? 0 : (2 * inter) / (nx + ny);
}

const dayDiff = (a: string, b: string) => Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000);

/** 取引No の 5〜12文字目は会計を開いた日（YYYYMMDD）。締めが翌日以降になった会計の手がかり */
export function txOpenDate(txNo: string): string | null {
  const m = /^\d{4}(\d{4})(\d{2})(\d{2})/.exec(txNo);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function nearDays(l: AirLine, soldOn: string): number {
  const open = txOpenDate(l.txNo);
  return Math.min(dayDiff(l.txDate, soldOn), open ? dayDiff(open, soldOn) : 99);
}

function payCompatible(airPay: string, salePay: string | null): boolean {
  if (!salePay) return false;
  return airPay.split("/").includes(salePay);
}

/** 単価（税抜・割引後）。money-os 側は 金額÷個数 */
function saleUnit(s: SaleLite): number {
  const q = s.qty && s.qty > 0 ? s.qty : 1;
  return Math.round(s.amount / q);
}

export type IssueKind =
  | "missing" // Airレジにあって money-os に無い
  | "extra" // money-os にあって Airレジに無い
  | "pay" // 支払方法が違う
  | "amount"; // 個数・金額が違う

export type MatchPair = { air: AirLine; sale: SaleLite; payOk: boolean; amountOk: boolean };

export type Reconcile = {
  pairs: MatchPair[];
  missing: AirLine[];
  extra: SaleLite[];
  cancelled: AirLine[];
  airTotal: number;
  moneyTotal: number;
};

const MAX_DAYS = 3;

/**
 * 明細 ↔ 売上 の突き合わせ。
 *  1段目: 金額一致の組を全部列挙し、(日付差, 支払不一致, 品名の似てなさ) の小さい順に結ぶ
 *  2段目: 残りどうしで「単価一致・日付差1日以内」を結ぶ＝個数か金額の打ち間違い
 */
export function reconcile(airLinesAll: AirLine[], sales: SaleLite[]): Reconcile {
  const cancel = cancelledKeys(airLinesAll);
  const cancelled = airLinesAll.filter((l) => l.kind === "会計" && cancel.has(lineKey(l)));
  const air = airLinesAll.filter((l) => l.kind === "会計" && !cancel.has(lineKey(l)) && l.net !== 0);

  const usedA = new Set<number>();
  const usedS = new Set<number>();
  const pairs: MatchPair[] = [];

  type Cand = { a: number; s: number; score: number };
  const run = (pred: (l: AirLine, s: SaleLite) => boolean, amountOk: boolean) => {
    const cands: Cand[] = [];
    air.forEach((l, a) => {
      if (usedA.has(a)) return;
      sales.forEach((s, si) => {
        if (usedS.has(si) || !pred(l, s)) return;
        const d = nearDays(l, s.soldOn);
        if (d > MAX_DAYS) return;
        const pay = payCompatible(l.pay, s.payMethod) ? 0 : 1;
        const sim = similarity(l.productName, s.productName);
        cands.push({ a, s: si, score: d * 10 + pay * 3 + (1 - sim) * 2 });
      });
    });
    cands.sort((x, y) => x.score - y.score || x.a - y.a || x.s - y.s);
    for (const c of cands) {
      if (usedA.has(c.a) || usedS.has(c.s)) continue;
      usedA.add(c.a); usedS.add(c.s);
      const l = air[c.a], s = sales[c.s];
      pairs.push({ air: l, sale: s, payOk: payCompatible(l.pay, s.payMethod), amountOk });
    }
  };

  run((l, s) => l.net === s.amount, true);
  run((l, s) => {
    const airUnit = Math.round(l.net / (l.qty || 1));
    const listUnit = s.listPrice != null ? s.listPrice + (s.discount ?? 0) : null;
    return nearDays(l, s.soldOn) <= 1 && (airUnit === saleUnit(s) || airUnit === listUnit || l.unitPrice === s.listPrice);
  }, false);

  pairs.sort((x, y) => x.air.txDate.localeCompare(y.air.txDate) || x.air.txNo.localeCompare(y.air.txNo) || x.air.lineNo - y.air.lineNo);
  return {
    pairs,
    missing: air.filter((_, i) => !usedA.has(i)),
    extra: sales.filter((_, i) => !usedS.has(i)),
    cancelled,
    airTotal: air.reduce((t, l) => t + l.net, 0),
    moneyTotal: sales.reduce((t, s) => t + s.amount, 0),
  };
}

/** Airレジの出金 ↔ money-os の経費（店の現金）。金額一致・日付3日以内で結ぶ */
export function matchCashOut(moves: AirCash[], expenses: ExpenseLite[]): { move: AirCash; expense: ExpenseLite | null }[] {
  const used = new Set<string>();
  return moves
    .filter((m) => m.kind === "出金")
    .map((m) => {
      const amt = Math.abs(m.amount);
      const hit = expenses
        .filter((e) => !used.has(e.id) && Number(e.amount) === amt && dayDiff(e.spentOn, m.bizDate) <= MAX_DAYS)
        .sort((a, b) => dayDiff(a.spentOn, m.bizDate) - dayDiff(b.spentOn, m.bizDate))[0];
      if (hit) used.add(hit.id);
      return { move: m, expense: hit ?? null };
    });
}

/* ------------------------------------------------------------------ 追加するときの初期値 */

/** Airレジの品名から money-os の区分を推定（追加時の初期値。スタッフが直せる） */
export function guessCategory(productName: string): string {
  const n = productName.normalize("NFKC");
  if (/レギュラー|マスター|プラチナ|ライト|月会費|入会金|ヵ月|ヶ月|ケ月|か月/.test(n)) return "月会費(窓口)";
  if (/\d+分|レッスン|P\/L|ビジター|フィッティ|フィッテイ|休会|登録料|家族|チケット|打席/i.test(n)) return "利用料";
  return "販売";
}

/** 税込（10%・円未満四捨五入）。Airレジのジャーナルは明細ごとの税を持たないため */
export const withTax10 = (net: number) => Math.round(net * 1.1);

/** 要確認メモの印。一覧の検索・「確認完了」で外す */
export const CHECK_MARK = "【要確認】";

/** 売上行が「スタッフの記入待ち」か（お客様名・会員区分・商品名の空欄、または要確認メモ） */
export function needsFill(s: { customerName: string | null; memberKind: string | null; productName: string | null; memo: string | null }): string[] {
  const why: string[] = [];
  if (!s.customerName?.trim()) why.push("お客様名");
  if (!s.memberKind?.trim()) why.push("会員区分");
  if (!s.productName?.trim()) why.push("商品名");
  if (s.memo?.startsWith(CHECK_MARK)) why.push("要確認メモ");
  return why;
}
