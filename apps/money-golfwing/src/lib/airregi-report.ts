// airregi-report.ts — Airレジ照合の「文章型レポート」を組み立てる（純粋関数・DBアクセス禁止）
//
// ユーザー依頼（2026-10-01）「このような文章型のレポートを表示できるようにしてください」
//   ＝ 合計と差額 → 差額の内訳（A 入っていない／B Airレジに無い）→ C 支払方法 → D 中身・記入漏れ → E 経費 → 備考
//   を、人が読んでそのまま共有できる文章にする。画面表示（sections）とコピー用テキスト（text）を同じデータから作る。
//
// 判定は airregi.ts の reconcile / matchCashOut をそのまま使う（照合画面とレポートで数字が割れないように）。

import {
  reconcile,
  matchCashOut,
  similarity,
  normName,
  guessCategory,
  CHECK_MARK,
  lineKey,
  type AirLine,
  type AirCash,
  type ExpenseLite,
  type SaleLite,
} from "./airregi.ts";

export type ReportSale = SaleLite & {
  category: string;
  memberKind: string | null;
  itemType: string | null;
  maker?: string | null;
  memo: string | null;
};

export type ReportInput = {
  storeName: string;
  ym: string; // YYYY-MM
  /** 前後数日を含む Airレジ明細（返品の元取引も含める） */
  lines: AirLine[];
  /** 前後数日を含む money-os 売上（source='app'） */
  sales: ReportSale[];
  /** その月の Airレジ 入出金 */
  cashMoves: AirCash[];
  /** 前後数日を含む money-os 経費（全支払方法） */
  expenses: ExpenseLite[];
  /** 「確認済み」 key = `${ref_kind}:${ref}` → 理由 */
  checks?: Map<string, string>;
};

export type ReportRow = { cells: string[]; note?: string };
export type ReportSection = {
  key: "A" | "B" | "C" | "D" | "E" | "Z";
  title: string;
  columns?: string[];
  rows: ReportRow[];
  /** 表の下に出す一言（→ 〜） */
  notes: string[];
  /** 表を使わない箇条書き（D など） */
  bullets?: string[];
};

export type Report = {
  title: string;
  summary: string[];
  sections: ReportSection[];
  ok: boolean;
  text: string;
};

/* ------------------------------------------------------------------ 表記 */

const yen = (n: number) => `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("ja-JP")}`;
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toLocaleString("ja-JP")}`;
/** "2026-09-03" → "9/3" */
export const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const sama = (name: string | null | undefined) => (name && name.trim() ? `${name.trim()}様` : "（お客様名なし）");
const payJa = (p: string) => p.split("/").filter(Boolean).join("＋") || "支払不明";
const monthJa = (ym: string) => `${Number(ym.slice(5, 7))}月`;

function monthBounds(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from, to };
}

/** 一覧を「、」でつなぐ（多すぎるときは先頭 n 件＋ほか◯件） */
function joinList(items: string[], n = 8): string {
  if (items.length <= n) return items.join("、");
  return `${items.slice(0, n).join("、")} ほか${items.length - n}件`;
}

/* ------------------------------------------------------------------ 区分の見込み */

const SALES_ITEM_TYPES = /シャフト|グリップ|グローブ|ボール|スリーブ|シューズ|クラブ|工賃|アパレル|小物/;

/** その売上が本来どの区分か（見込み）。わからなければ null */
export function expectedCategory(s: Pick<ReportSale, "itemType" | "productName">, airProduct: string | null): string | null {
  const it = (s.itemType ?? "").normalize("NFKC");
  if (/月会費/.test(it)) return null; // 月会費（定額制）は 利用料/月会費(窓口) どちらもあり得る
  if (SALES_ITEM_TYPES.test(it)) return "販売";
  const name = airProduct ?? s.productName ?? "";
  if (!name) return null;
  const g = guessCategory(name);
  if (g === "月会費(窓口)") return null; // チケット制など揺れが正当なものが多いので指摘しない
  return g;
}

/** 品名が明らかに別物か（英字の銘柄語で判定。カナだけ・数字だけの品名は判定しない＝誤検知を避ける） */
export function productConflict(airName: string, saleName: string | null, maker?: string | null): boolean {
  if (!saleName) return false;
  const words = airName.normalize("NFKC").toLowerCase().split(/[^a-z0-9]+/).filter((w) => /[a-z]{3,}/.test(w));
  if (words.length === 0) return false;
  // Airレジの品名がメーカー名だけ（「USTマミヤ」「Iomic グリップ」）なら食い違いではない
  if (maker && (normName(maker).includes(words[0]) || similarity(airName, maker) >= 0.5)) return false;
  // 先頭の銘柄語（Tour, Sticky, Pro …）が money-os の品名に無い
  return !normName(saleName).includes(words[0]);
}

/* ------------------------------------------------------------------ 本体 */

export function buildReport(input: ReportInput): Report {
  const { from, to } = monthBounds(input.ym);
  const inMonth = (d: string) => d >= from && d < to;
  const checks = input.checks ?? new Map<string, string>();
  const checked = (kind: string, ref: string) => checks.get(`${kind}:${ref}`) ?? null;

  const r = reconcile(input.lines, input.sales);
  const saleById = new Map(input.sales.map((s) => [s.id, s]));

  const cancelled = r.cancelled.filter((l) => inMonth(l.txDate));
  const cancelKeys = new Set(cancelled.map(lineKey));
  const monthLines = input.lines.filter((l) => l.kind === "会計" && inMonth(l.txDate) && !cancelKeys.has(lineKey(l)) && l.net !== 0);
  const monthSales = input.sales.filter((s) => inMonth(s.soldOn));
  const airTotal = monthLines.reduce((t, l) => t + l.net, 0);
  const moneyTotal = monthSales.reduce((t, s) => t + s.amount, 0);
  const diff = airTotal - moneyTotal; // ＋＝money-os が足りない

  const missing = r.missing.filter((l) => inMonth(l.txDate));
  const extra = r.extra.filter((s) => inMonth(s.soldOn));
  const amount = r.pairs.filter((p) => !p.amountOk && (inMonth(p.air.txDate) || inMonth(p.sale.soldOn)));
  const pay = r.pairs.filter((p) => p.amountOk && !p.payOk && (inMonth(p.air.txDate) || inMonth(p.sale.soldOn)));
  const partialPay = r.pairs.filter(
    (p) => p.payOk && inMonth(p.sale.soldOn) && p.air.pay.includes("/") && p.sale.payMethod && p.air.pay !== p.sale.payMethod,
  );
  // 同じ会計の複数行（グリップ本体＋交換工賃 など）は1件にまとめて書く
  const partialByTx = new Map<string, (typeof partialPay)[number]>();
  for (const p of partialPay) if (!partialByTx.has(p.air.txNo)) partialByTx.set(p.air.txNo, p);

  const explained =
    missing.reduce((t, l) => t + l.net, 0) +
    amount.reduce((t, p) => t + (p.air.net - p.sale.amount), 0) -
    extra.reduce((t, s) => t + s.amount, 0);

  const sections: ReportSection[] = [];
  const checkedNote = (kind: string, ref: string) => {
    const c = checked(kind, ref);
    return c ? `確認済み：${c}` : undefined;
  };

  /* A. money-os に入っていない */
  {
    const rows: { date: string; row: ReportRow }[] = [];
    for (const p of amount) {
      const s = saleById.get(p.sale.id);
      const blank = !p.sale.productName ? "（商品名も空欄）" : "";
      rows.push({
        date: p.air.txDate + p.air.txTime,
        row: {
          cells: [
            md(p.air.txDate),
            `${sama(s?.customerName)}の会計の ${p.air.productName} ${p.air.qty}個 → money-osは${p.sale.qty ?? 1}個・${yen(p.sale.amount)}円${blank}`,
            signed(p.air.net - p.sale.amount),
            payJa(p.air.pay),
          ],
          note: checkedNote("amount", p.sale.id),
        },
      });
    }
    for (const l of missing) {
      const open = l.txNo.length >= 12 ? `${Number(l.txNo.slice(8, 10))}/${Number(l.txNo.slice(10, 12))}` : null;
      const late = open && open !== md(l.txDate) ? `（${open} ${l.txNo.slice(12, 14)}:${l.txNo.slice(14, 16)}開始の会計）` : "";
      rows.push({
        date: l.txDate + l.txTime,
        row: {
          cells: [`${md(l.txDate)} ${l.txTime.slice(0, 5)}`, `${l.productName} ${l.qty}点${late}`, signed(l.net), payJa(l.pay)],
          note: checkedNote("air_line", lineKey(l)),
        },
      });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));

    // 1件も money-os に入っていない日
    const saleDays = new Set(monthSales.map((s) => s.soldOn));
    // 会計を開いた日（取引Noの日付）も含める＝前日に開いて翌日締めた会計の日も「入っていない日」に数える
    const days = missing.flatMap((l) => {
      const o = /^\d{4}(\d{4})(\d{2})(\d{2})/.exec(l.txNo);
      return o ? [l.txDate, `${o[1]}-${o[2]}-${o[3]}`] : [l.txDate];
    });
    const emptyDays = Array.from(new Set(days)).filter((d) => inMonth(d) && !saleDays.has(d)).sort();
    const notes = emptyDays.length > 0 ? [`${emptyDays.map(md).join("・")}の分は money-os に1件も入っていません。`] : [];
    if (rows.length > 0) {
      sections.push({ key: "A", title: "money-os に入っていない（要入力）", columns: ["日付", "Airレジ", "金額(税抜)", "支払"], rows: rows.map((x) => x.row), notes });
    }
  }

  /* B. money-os にあって Airレジに無い */
  if (extra.length > 0) {
    const rows = extra.map((s) => {
      const full = saleById.get(s.id);
      const memo = full?.memo && !full.memo.startsWith(CHECK_MARK) ? `（${full.memo}）` : "";
      return {
        cells: [md(s.soldOn), `${sama(s.customerName)}「${s.productName ?? full?.category ?? ""}×${s.qty ?? 1}${memo}」`, signed(-s.amount), s.payMethod ?? "支払不明"],
        note: checkedNote("sale", s.id),
      };
    });
    const notes: string[] = [];
    if (extra.some((s) => s.payMethod === "Square")) notes.push("Airレジを通さず Square 端末だけで決済した可能性があります。Square 側の入金を見て確認してください。");
    if (extra.some((s) => s.payMethod === "現金")) notes.push("現金のものは二重入力の可能性があります。レジ締めの過不足と合わせて確認してください。");
    sections.push({ key: "B", title: "money-os にあって Airレジに無い", columns: ["日付", "money-os", "金額(税抜)", "支払"], rows, notes });
  }

  /* C. 支払方法が違う */
  {
    const bullets: string[] = [];
    for (const p of pay) {
      const s = saleById.get(p.sale.id);
      const c = checked("pay", p.sale.id);
      bullets.push(
        `${md(p.sale.soldOn)} ${sama(s?.customerName)} ${p.sale.productName ?? p.air.productName} ${yen(p.sale.amount)}：Airレジ=${payJa(p.air.pay)} / money-os=${p.sale.payMethod ?? "（空）"}${c ? `（確認済み：${c}）` : ""}`,
      );
    }
    for (const p of partialByTx.values()) {
      const s = saleById.get(p.sale.id);
      const hasMemo = !!s?.memo && /現金|円/.test(s.memo);
      bullets.push(
        `${md(p.sale.soldOn)} ${sama(s?.customerName)} ${p.sale.productName ?? p.air.productName}：Airレジ=${payJa(p.air.pay)} / money-os=${p.sale.payMethod}のみ${hasMemo ? "（メモに記載あり＝実害なし）" : ""}`,
      );
    }
    if (bullets.length > 0) {
      sections.push({ key: "C", title: "支払方法が違う（金額は一致）", rows: [], notes: [], bullets });
    }
  }

  /* D. 中身の食い違い・記入漏れ */
  {
    const bullets: string[] = [];
    const pairBySale = new Map(r.pairs.map((p) => [p.sale.id, p]));

    // 品名の食い違い
    for (const p of r.pairs) {
      if (!inMonth(p.sale.soldOn) || !productConflict(p.air.productName, p.sale.productName, saleById.get(p.sale.id)?.maker)) continue;
      const s = saleById.get(p.sale.id);
      bullets.push(`${md(p.sale.soldOn)} ${sama(s?.customerName)}：Airレジ「${p.air.productName}」 / money-os「${p.sale.productName}」 → どちらが正しいか要確認`);
    }

    const label = (s: ReportSale) => {
      const prod = s.productName ?? pairBySale.get(s.id)?.air.productName ?? "";
      return `${md(s.soldOn)} ${sama(s.customerName)}${prod ? `の${prod}` : ""}`;
    };
    const noProduct = monthSales.filter((s) => !s.productName?.trim()).map((s) => {
      const air = pairBySale.get(s.id)?.air.productName;
      return `${md(s.soldOn)} ${sama(s.customerName)}${air ? `の ${air}` : ""}`;
    });
    if (noProduct.length > 0) bullets.push(`商品名が空欄：${joinList(noProduct)}`);
    const noCustomer = monthSales.filter((s) => !s.customerName?.trim()).map((s) => `${md(s.soldOn)} ${s.productName ?? s.category} ${yen(s.amount)}円`);
    if (noCustomer.length > 0) bullets.push(`お客様名が空欄：${joinList(noCustomer)}`);
    const noKind = monthSales.filter((s) => !s.memberKind?.trim()).map((s) => `${md(s.soldOn)} ${sama(s.customerName)}`);
    if (noKind.length > 0) bullets.push(`会員区分が空欄：${joinList(noKind)}`);
    const flagged = monthSales.filter((s) => s.memo?.startsWith(CHECK_MARK)).map(label);
    if (flagged.length > 0) bullets.push(`${CHECK_MARK}のまま：${joinList(flagged)}`);

    // 区分の揺れ（実際の区分ごとにまとめる）
    // key=「販売のはずが「利用料」に」→ 同じ日・同じお客様の品名をまとめる
    const wobble = new Map<string, Map<string, string[]>>();
    for (const s of monthSales) {
      const air = pairBySale.get(s.id)?.air.productName ?? null;
      const exp = expectedCategory(s, air);
      if (!exp || exp === s.category) continue;
      if (s.category === "月会費(窓口)" && exp === "利用料") continue; // チケット・回数券は月会費扱いもあり
      const k = `${exp}のはずが「${s.category}」に`;
      const who = `${md(s.soldOn)} ${sama(s.customerName)}`;
      const g = wobble.get(k) ?? new Map<string, string[]>();
      g.set(who, [...(g.get(who) ?? []), s.productName ?? air ?? ""].filter(Boolean));
      wobble.set(k, g);
    }
    for (const [k, g] of wobble) {
      const items = Array.from(g, ([who, prods]) => `${who}${prods.length ? `（${prods.join("・")}）` : ""}`);
      bullets.push(`区分の揺れ（${k}）：${joinList(items, 6)}`);
    }
    if (bullets.length > 0) sections.push({ key: "D", title: "中身の食い違い・記入漏れ", rows: [], notes: [], bullets });
  }

  /* E. レジの出金が経費に無い */
  {
    const cashExp = input.expenses.filter((e) => e.method === "cash");
    const matched = matchCashOut(input.cashMoves, cashExp);
    const open = matched.filter((m) => !m.expense);
    const monthExpCount = input.expenses.filter((e) => inMonth(e.spentOn)).length;
    if (open.length > 0) {
      const total = open.reduce((t, m) => t + Math.abs(m.move.amount), 0);
      sections.push({
        key: "E",
        title: "経費（Airレジの出金）が money-os に未入力",
        columns: ["日付", "内容", "金額"],
        rows: open.map((m) => ({
          cells: [md(m.move.bizDate), m.move.comment || "（コメントなし）", yen(Math.abs(m.move.amount))],
          note: checkedNote("cash", `${m.move.occurredAt}|${m.move.amount}`),
        })),
        notes: [`計 ${yen(total)}円。${monthJa(input.ym)}の money-os 経費は${monthExpCount}件です。`],
      });
    }
  }

  /* 備考 */
  {
    const bullets: string[] = [];
    const returns = input.lines.filter((l) => l.kind === "返品");
    for (const c of cancelled) {
      const ret = returns.find((x) => x.origTxNo === c.txNo);
      const retDate = ret ? md(ret.txDate) : "後日";
      let b = `${md(c.txDate)} の${payJa(c.pay)}「${c.productName}」${yen(c.net)}円は ${retDate} に返品（取消）済みのため、Airレジ・money-os とも数えていません。`;
      if (c.pay.split("/").includes("現金") && ret && ret.txDate > c.txDate) {
        b += `${md(c.txDate)}〜${md(ret.txDate)}の間は Airレジ上の現金が ${yen(Math.round(c.net * 1.1))}円多かったはずなので、この期間のレジ締めで過不足が出ていればこれが原因です。`;
      }
      bullets.push(b);
    }
    if (bullets.length > 0) sections.push({ key: "Z", title: "備考", rows: [], notes: [], bullets });
  }

  /* 見出しと要約 */
  const title = `${monthJa(input.ym)} ${input.storeName}：Airレジ × money-os 突き合わせ結果`;
  const cancelNote = cancelled.length > 0 ? `（返品で取り消した ${cancelled.map((c) => `${md(c.txDate)} ${yen(c.net)}円`).join("・")} を除く）` : "";
  const summary = [
    `合計（税抜）：Airレジ ${yen(airTotal)}円${cancelNote}／money-os ${yen(moneyTotal)}円 → 差額 ${yen(Math.abs(diff))}円${diff === 0 ? "（一致）" : diff > 0 ? "（money-os が少ない）" : "（money-os が多い）"}`,
  ];
  const ab = sections.filter((s) => s.key === "A" || s.key === "B").map((s) => s.key).join("・");
  if (diff !== 0) {
    summary.push(
      explained === diff
        ? `差額の内訳は下の ${ab} で全部説明がつきます。`
        : `下の ${ab || "一覧"} で説明できるのは ${yen(explained)}円です。残り ${yen(diff - explained)}円は前後の月にずれた入力などの可能性があります。`,
    );
  }
  const ok = sections.length === 0;
  if (ok) summary.push(`${monthJa(input.ym)}は Airレジと money-os がすべて合っています。`);

  return { title, summary, sections, ok, text: toText(title, summary, sections) };
}

/* ------------------------------------------------------------------ コピー用テキスト */

const SECTION_HEAD: Record<ReportSection["key"], string> = { A: "A.", B: "B.", C: "C.", D: "D.", E: "E.", Z: "" };

export function toText(title: string, summary: string[], sections: ReportSection[]): string {
  const out: string[] = [title, "", ...summary];
  for (const s of sections) {
    out.push("", `${SECTION_HEAD[s.key]} ${s.title}`.trim());
    if (s.columns && s.rows.length > 0) {
      s.rows.forEach((r) => {
        out.push(`・${r.cells.join("　")}${r.note ? `　［${r.note}］` : ""}`);
      });
    }
    for (const b of s.bullets ?? []) out.push(`・${b}`);
    for (const n of s.notes) out.push(`→ ${n}`);
  }
  return out.join("\n");
}
