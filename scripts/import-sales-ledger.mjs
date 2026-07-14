#!/usr/bin/env node
/**
 * 売上台帳（売上データ.xlsx）→ mon_sales_lines → mon_sales → fin_entries
 *
 * これまで毎月手作業だった「店頭決済の取込」を1コマンドにする（DECISIONS #57 / migration 0052）。
 *
 * 使い方:
 *   node scripts/import-sales-ledger.mjs --file=apps/report-os/source/売上データ.xlsx --month=2026-07
 *      → 取込内容を表示するだけ（dry-run）。DBは変更しない。
 *   node scripts/import-sales-ledger.mjs --file=... --month=2026-07 --apply
 *      → mon_sales_lines を月単位で入れ替え、refresh_mon_sales_from_lines() で
 *        月次サマリ(mon_sales)と財務(fin_entries)まで反映する。
 *
 * env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 【設計メモ】
 * - 税抜金額: 台帳の「金額」列が空の行がある（31期以降）。その場合は 税込/1.1 を四捨五入する。
 *   6月実績 1,487,906円 をこの規則で1円まで再現できることを確認済み。
 * - 台帳の「月会費」は窓口決済。口座振替の月会費実績とは別物なので、月次サマリでは
 *   '月会費(窓口)' として保存する（0028の月会費予測を誤って止めないため。0052のコメント参照）。
 * - 何度実行しても同じ結果になる（対象月の source='excel' 行を論理削除してから入れ直す）。
 */

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";

// ---------- 引数 ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  })
);
const FILE = args.file || "apps/report-os/source/売上データ.xlsx";
const MONTH = String(args.month || "");
const APPLY = !!args.apply;
const STORE = args.store || "GOLF WING";

if (!/^\d{4}-\d{2}$/.test(MONTH)) {
  console.error("使い方: node scripts/import-sales-ledger.mjs --file=<xlsx> --month=YYYY-MM [--apply]");
  process.exit(1);
}
const [Y, M] = MONTH.split("-").map(Number);
const monthStart = new Date(Date.UTC(Y, M - 1, 1));
const monthEnd = new Date(Date.UTC(Y, M, 1));

// ---------- xlsx を読む ----------
const COLS = {
  date: ["日付"],
  customer: ["お客様名"],
  memberKind: ["会員orビジター"],
  itemCategory: ["品目"],
  itemType: ["種類"],
  maker: ["メーカー名"],
  product: ["品名"],
  listPrice: ["定価"],
  discount: ["割引額"],
  salePrice: ["売価"],
  qty: ["個数"],
  amount: ["金額"],
  taxIncluded: ["税込"],
  payMethod: ["支払い方法"],
  memo: ["備考"],
  pro: ["担当プロ"],
};

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "object" && v.result !== undefined ? v.result : v;
  const f = Number(n);
  return Number.isFinite(f) ? f : null;
};
const str = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(typeof v === "object" && v.text ? v.text : v).trim();
  return s === "" ? null : s;
};

async function parse(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const rows = [];

  for (const ws of wb.worksheets) {
    const m = ws.name.match(/^(\d+)期/);
    if (!m) continue; // 「売上内訳」「現金✓」などの補助シートは対象外
    const fiscalTerm = Number(m[1]);

    // ヘッダ行（1行目）から列位置を作る。シートごとに列構成が違うため名前で引く
    const header = ws.getRow(1).values; // 1-based
    const ix = {};
    for (const [key, names] of Object.entries(COLS)) {
      const i = header.findIndex((h) => names.includes(str(h)));
      if (i > 0) ix[key] = i;
    }
    if (!ix.date || !ix.itemCategory) continue;

    ws.eachRow((row, n) => {
      if (n === 1) return;
      const d = row.getCell(ix.date).value;
      const dt = d instanceof Date ? d : null;
      if (!dt) return;
      if (dt < monthStart || dt >= monthEnd) return;

      const taxIncluded = ix.taxIncluded ? num(row.getCell(ix.taxIncluded).value) : null;
      let amount = ix.amount ? num(row.getCell(ix.amount).value) : null;
      // 「金額」(税抜)が空の行は税込から逆算する。31期以降はこちらが多数
      if (amount === null && taxIncluded !== null) amount = Math.round(taxIncluded / 1.1);
      if (amount === null && taxIncluded === null) return;

      const category = ix.itemCategory ? str(row.getCell(ix.itemCategory).value) : null;
      if (!category) return; // 品目なし＝集計行・空行

      rows.push({
        fiscal_term: fiscalTerm,
        sold_on: dt.toISOString().slice(0, 10),
        customer_name: ix.customer ? str(row.getCell(ix.customer).value) : null,
        member_kind: ix.memberKind ? str(row.getCell(ix.memberKind).value) : null,
        item_category: category,
        item_type: ix.itemType ? str(row.getCell(ix.itemType).value) : null,
        maker: ix.maker ? str(row.getCell(ix.maker).value) : null,
        product_name: ix.product ? str(row.getCell(ix.product).value) : null,
        list_price: ix.listPrice ? num(row.getCell(ix.listPrice).value) : null,
        discount: ix.discount ? num(row.getCell(ix.discount).value) : null,
        sale_price: ix.salePrice ? num(row.getCell(ix.salePrice).value) : null,
        qty: ix.qty ? num(row.getCell(ix.qty).value) : null,
        amount,
        tax_included: taxIncluded,
        pay_method: ix.payMethod ? str(row.getCell(ix.payMethod).value) : null,
        pro: ix.pro ? str(row.getCell(ix.pro).value) : null,
        memo: ix.memo ? str(row.getCell(ix.memo).value) : null,
        source: "excel",
      });
    });
  }
  return rows;
}

// ---------- 実行 ----------
const file = path.resolve(process.cwd(), FILE);
if (!fs.existsSync(file)) {
  console.error(`ファイルが見つかりません: ${file}`);
  process.exit(1);
}

const rows = await parse(file);
if (rows.length === 0) {
  console.error(`${MONTH} の明細が台帳にありません。台帳が更新されているか確認してください。`);
  process.exit(1);
}

const byCat = {};
for (const r of rows) {
  const k = r.item_category;
  byCat[k] ??= { n: 0, amount: 0, tax: 0 };
  byCat[k].n++;
  byCat[k].amount += r.amount ?? 0;
  byCat[k].tax += r.tax_included ?? 0;
}
const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);

console.log(`\n売上台帳 ${MONTH}（${path.basename(file)}）`);
console.log("─".repeat(52));
for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1].amount - a[1].amount)) {
  console.log(`  ${k.padEnd(10)} ${String(v.n).padStart(4)}件  税抜 ${v.amount.toLocaleString("ja-JP").padStart(11)}円`);
}
console.log("─".repeat(52));
console.log(`  ${"合計".padEnd(10)} ${String(rows.length).padStart(4)}件  税抜 ${total.toLocaleString("ja-JP").padStart(11)}円`);
console.log(`\n※ 月会費（口座振替）はこの台帳に含まれません。ファイン実績が届くまでは予測値が使われます。`);

if (!APPLY) {
  console.log(`\n（dry-run。DBは変更していません。反映するには --apply を付けてください）\n`);
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("env NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: store, error: e1 } = await db
  .from("stores")
  .select("id, company_id, segment_id, name")
  .ilike("name", `%${STORE}%`)
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();
if (e1 || !store) {
  console.error(`店舗が見つかりません（--store=${STORE}）: ${e1?.message ?? ""}`);
  process.exit(1);
}

// 対象月の台帳行を入れ替える（べき等）
const from = `${MONTH}-01`;
const to = `${monthEnd.toISOString().slice(0, 10)}`;
const { error: e2 } = await db
  .from("mon_sales_lines")
  .update({ deleted_at: new Date().toISOString() })
  .eq("company_id", store.company_id)
  .eq("store_id", store.id)
  .eq("source", "excel")
  .is("deleted_at", null)
  .gte("sold_on", from)
  .lt("sold_on", to);
if (e2) {
  console.error(`既存明細の入れ替えに失敗: ${e2.message}`);
  process.exit(1);
}

const payload = rows.map((r) => ({
  ...r,
  company_id: store.company_id,
  store_id: store.id,
  segment_id: store.segment_id,
}));
const { error: e3 } = await db.from("mon_sales_lines").insert(payload);
if (e3) {
  console.error(`明細の取込に失敗: ${e3.message}`);
  process.exit(1);
}

// 月次サマリ(mon_sales) と 財務(fin_entries) まで一気に反映
const { data: n, error: e4 } = await db.rpc("refresh_mon_sales_from_lines", {
  p_company_id: store.company_id,
  p_month: from,
});
if (e4) {
  console.error(`月次サマリの再計算に失敗: ${e4.message}`);
  process.exit(1);
}

console.log(`\n✅ 取込完了 — 明細 ${rows.length}件 / 月次サマリ ${n}行 → fin_entries まで反映しました（${store.name}）\n`);
