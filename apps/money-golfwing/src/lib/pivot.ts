// pivot.ts — 売上の集計表（Excelのピボット相当・#285）の純粋ロジック（DBアクセス禁止・server-only禁止）
// tests/sales-pivot.test.ts から直接importしてテストする。
//
// 2026-09-28 ユーザー依頼「売上を見るでエクセル一覧のように表示できるか。
//   例えばパーソナル件数が、どの担当が何件でいくらかがわかるようにしたい」
//
// 取引（SaleFact）を「品目1つ＝1行」に広げてから、行×列で 件数・回数・金額 を数える。
//   件数 = 取引の数（お会計の回数）
//   回数 = 個数の合計（パーソナル25分×2 を1件で入れたら 件数1・回数2）
// 金額は税抜（売上を見るの他の数字と同じ物差し）。

import type { SaleFact, SaleItem } from "./sales-drill";

/** sales-drill.ts の allocate と同じ按分（テストから直接読めるよう、実行時の import を持たない） */
function allocate(total: number, items: SaleItem[]): number[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [total];
  const w = items.map((i) => Math.max(0, Number(i.amount) || 0));
  let sum = w.reduce((a, b) => a + b, 0);
  const weights = sum > 0 ? w : items.map((i) => Math.max(1, Number(i.qty) || 1));
  sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((x) => Math.round((total * x) / sum));
  out[out.length - 1] += total - out.reduce((a, b) => a + b, 0);
  return out;
}

export type PivotRow = {
  date: string;
  month: string;
  category: string;
  item: string;
  itemKey: string;
  type: string;
  customer: string;
  memberKind: string;
  pay: string;
  pro: string;
  qty: number;
  amount: number;
};

export const DIMS = {
  pro: "担当",
  item: "商品・内容",
  type: "種類",
  category: "区分",
  customer: "お客様",
  memberKind: "会員区分",
  pay: "払い方",
  month: "月",
  date: "日",
} as const;
export type Dim = keyof typeof DIMS;

export function isDim(v: unknown): v is Dim {
  return typeof v === "string" && v in DIMS;
}

export const BLANK = "（未設定）";

/**
 * 同じ商品をまとめるための鍵。
 * 台帳は「パーソナルレッスン（25分）」、画面入力は「パーソナルレッスン２５分」のように揺れるので、
 * 全角半角・空白・かっこ類を落として同じ行にまとめる。
 */
export function pivotItemKey(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s()（）［］\[\]【】「」『』・,，、。.]/g, "");
}

/** 取引を品目1つ＝1行に広げる（1会計に複数品目があるときは金額を按分） */
export function explode(facts: SaleFact[]): PivotRow[] {
  const out: PivotRow[] = [];
  for (const f of facts) {
    const items = f.items.length ? f.items : [{ name: "", qty: 1, amount: f.amount }];
    const amounts = allocate(f.amount, items);
    items.forEach((it, i) => {
      const name = (it.name || "").trim();
      out.push({
        date: f.date,
        month: f.date.slice(0, 7),
        category: f.category,
        item: name,
        itemKey: pivotItemKey(name),
        type: f.type,
        customer: f.customer,
        memberKind: f.memberKind,
        pay: f.pay,
        pro: f.pro,
        qty: Math.max(1, Number(it.qty) || 1),
        amount: amounts[i] ?? 0,
      });
    });
  }
  return out;
}

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");

/**
 * 絞り込み。q は「商品・種類・区分」にその言葉が含まれるもの（空白区切りはどれかを含む＝OR）。
 * 例: 「パーソナル」→ パーソナルレッスン（25分）／パーソナルレッスン２５分 の両方
 */
export function filterRows(rows: PivotRow[], f: { q?: string; category?: string; pro?: string }): PivotRow[] {
  const words = (f.q ?? "").split(/[\s　]+/).map(norm).filter(Boolean);
  return rows.filter((r) => {
    if (f.category && r.category !== f.category) return false;
    if (f.pro && (r.pro || BLANK) !== f.pro) return false;
    if (!words.length) return true;
    const hay = norm(`${r.item} ${r.type} ${r.category}`);
    return words.some((w) => hay.includes(w));
  });
}

export type Cell = { count: number; qty: number; amount: number };
export type Pivot = {
  rowDim: Dim;
  colDim: Dim | null;
  rows: { key: string; label: string; total: Cell }[];
  cols: { key: string; label: string; total: Cell }[];
  cells: Map<string, Cell>;
  grand: Cell;
};

const empty = (): Cell => ({ count: 0, qty: 0, amount: 0 });
const add = (c: Cell, r: PivotRow) => {
  c.count += 1;
  c.qty += r.qty;
  c.amount += r.amount;
};

function keyOf(r: PivotRow, d: Dim): string {
  if (d === "item") return r.itemKey || "";
  return String(r[d] ?? "").trim();
}

/** 時間の軸（月・日）は古い順、それ以外は金額の大きい順。未設定はいつも最後 */
function order(d: Dim, list: { key: string; total: Cell }[]) {
  const time = d === "month" || d === "date";
  return list.sort((a, b) => {
    if (!a.key && b.key) return 1;
    if (a.key && !b.key) return -1;
    return time ? a.key.localeCompare(b.key) : b.total.amount - a.total.amount || a.key.localeCompare(b.key);
  });
}

export function cellKey(row: string, col: string) {
  return `${row}\u0000${col}`;
}

export function buildPivot(rows: PivotRow[], rowDim: Dim, colDim: Dim | null): Pivot {
  const rowTotals = new Map<string, Cell>();
  const colTotals = new Map<string, Cell>();
  const cells = new Map<string, Cell>();
  // 商品は「いちばん多く使われている書き方」を見出しにする
  const labelVotes = new Map<string, Map<string, number>>();
  const grand = empty();

  for (const r of rows) {
    const rk = keyOf(r, rowDim);
    const ck = colDim ? keyOf(r, colDim) : "";
    for (const [dim, k] of [[rowDim, rk], [colDim, ck]] as const) {
      if (dim === "item") {
        const v = labelVotes.get(k) ?? new Map<string, number>();
        v.set(r.item, (v.get(r.item) ?? 0) + 1);
        labelVotes.set(k, v);
      }
    }
    const rt = rowTotals.get(rk) ?? empty();
    add(rt, r);
    rowTotals.set(rk, rt);
    if (colDim) {
      const ct = colTotals.get(ck) ?? empty();
      add(ct, r);
      colTotals.set(ck, ct);
      const ce = cells.get(cellKey(rk, ck)) ?? empty();
      add(ce, r);
      cells.set(cellKey(rk, ck), ce);
    }
    add(grand, r);
  }

  const label = (d: Dim, k: string) => {
    if (!k) return d === "pro" ? "（担当なし）" : BLANK;
    if (d === "item") {
      const v = labelVotes.get(k);
      if (v) return [...v.entries()].sort((a, b) => b[1] - a[1])[0][0] || BLANK;
    }
    if (d === "month") return `${Number(k.slice(0, 4))}年${Number(k.slice(5, 7))}月`;
    if (d === "date") return `${Number(k.slice(5, 7))}/${Number(k.slice(8, 10))}`;
    return k;
  };

  return {
    rowDim,
    colDim,
    rows: order(rowDim, [...rowTotals.entries()].map(([key, total]) => ({ key, total }))).map((r) => ({ ...r, label: label(rowDim, r.key) })),
    cols: colDim
      ? order(colDim, [...colTotals.entries()].map(([key, total]) => ({ key, total }))).map((c) => ({ ...c, label: label(colDim, c.key) }))
      : [],
    cells,
    grand,
  };
}

/** 平均単価（1回あたり） */
export function unitPrice(c: Cell): number {
  return c.qty ? Math.round(c.amount / c.qty) : 0;
}

/** Excelで開ける CSV（先頭にBOM）。列ごとに 件数・回数・金額 を並べる */
export function pivotCsv(p: Pivot): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head: string[] = [DIMS[p.rowDim]];
  const cols = p.colDim ? p.cols : [];
  for (const c of cols) head.push(`${c.label} 件数`, `${c.label} 回数`, `${c.label} 金額`);
  head.push("合計 件数", "合計 回数", "合計 金額", "1回あたり");
  const lines = [head.map(esc).join(",")];
  for (const r of p.rows) {
    const line: (string | number)[] = [r.label];
    for (const c of cols) {
      const x = p.cells.get(cellKey(r.key, c.key)) ?? empty();
      line.push(x.count, x.qty, x.amount);
    }
    line.push(r.total.count, r.total.qty, r.total.amount, unitPrice(r.total));
    lines.push(line.map(esc).join(","));
  }
  const tot: (string | number)[] = ["合計"];
  for (const c of cols) tot.push(c.total.count, c.total.qty, c.total.amount);
  tot.push(p.grand.count, p.grand.qty, p.grand.amount, unitPrice(p.grand));
  lines.push(tot.map(esc).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
