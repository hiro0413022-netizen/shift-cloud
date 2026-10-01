"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMoneyActor, type MoneyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getCurrentStore, canWriteStore, rebalanceCashLedger } from "@/lib/money";
import { createSale, updateSale, type SaleUpdate } from "../sales/actions";
import {
  parseJournal,
  parseCashMoves,
  detectCsvKind,
  guessCategory,
  withTax10,
  CHECK_MARK,
} from "@/lib/airregi";

/* Airレジとの突き合わせ（0218・/airregi）
 *
 * ここの操作はすべて「既存の売上・経費の入口」を通す（createSale / updateSale / 経費と同じ書き方）。
 * 照合画面だけの書き込み経路を作ると、現金出納・在庫・PLの連携が片方だけ動く事故になる（#98 deleteSale の轍）。
 */

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

function back(ym: string, msg: string, err = false): never {
  const q = new URLSearchParams();
  if (/^\d{4}-\d{2}$/.test(ym)) q.set("ym", ym);
  q.set(err ? "err" : "msg", msg);
  redirect(`/airregi?${q.toString()}`);
}

async function writableStore(actor: MoneyActor) {
  const store = await getCurrentStore(actor);
  if (!store || !store.segmentId || !canWriteStore(actor, store.id)) return null;
  return store;
}

/** Shift_JIS（Airレジの既定）と UTF-8 のどちらでも読む */
function decode(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("shift_jis").decode(buf);
  }
}

/* ------------------------------------------------------------------ 取込 */

export async function uploadAirregi(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const ym = str(formData.get("ym"));
  const store = await writableStore(actor);
  if (!store) back(ym, "この店舗には取り込めません", true);
  const admin = createAdmin();

  const files = formData.getAll("files").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && (f as File).size > 0);
  if (files.length === 0) back(ym, "CSVファイルを選んでください", true);

  const done: string[] = [];
  let firstDate: string | null = null;
  for (const f of files) {
    const text = decode(await f.arrayBuffer());
    const kind = detectCsvKind(text);
    if (kind === "journal") {
      const lines = parseJournal(text);
      const rows = lines.map((l) => ({
        company_id: actor.companyId,
        store_id: store.id,
        tx_no: l.txNo,
        orig_tx_no: l.origTxNo,
        line_no: l.lineNo,
        kind: l.kind,
        tx_date: l.txDate,
        tx_time: l.txTime,
        product_name: l.productName,
        unit_price: l.unitPrice,
        qty: l.qty,
        net: l.net,
        pay: l.pay,
        uploaded_by: actor.name,
        uploaded_at: new Date().toISOString(),
      }));
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await admin.from("mon_airregi_lines").upsert(rows.slice(i, i + 200), { onConflict: "store_id,tx_no,line_no" });
        if (error) back(ym, `取り込めませんでした（${f.name}）: ${error.message}`, true);
      }
      const dates = lines.map((l) => l.txDate).sort();
      firstDate = firstDate ?? dates[0] ?? null;
      done.push(`売上の明細 ${rows.length}行`);
    } else if (kind === "cash") {
      const moves = parseCashMoves(text);
      const rows = moves.map((m) => ({
        company_id: actor.companyId,
        store_id: store.id,
        occurred_at: m.occurredAt,
        biz_date: m.bizDate,
        kind: m.kind,
        amount: m.amount,
        comment: m.comment || null,
        uploaded_by: actor.name,
        uploaded_at: new Date().toISOString(),
      }));
      if (rows.length > 0) {
        const { error } = await admin.from("mon_airregi_cash").upsert(rows, { onConflict: "store_id,occurred_at,amount" });
        if (error) back(ym, `取り込めませんでした（${f.name}）: ${error.message}`, true);
      }
      firstDate = firstDate ?? moves.map((m) => m.bizDate).sort()[0] ?? null;
      done.push(`お金の出し入れ ${rows.length}件`);
    } else {
      back(ym, `「${f.name}」はAirレジの「ジャーナル履歴」「入出金履歴」のCSVではないようです`, true);
    }
  }

  revalidatePath("/airregi");
  back(firstDate ? firstDate.slice(0, 7) : ym, `取り込みました：${done.join("・")}。下の「確認すること」を上から順に見てください`);
}

/* ------------------------------------------------------------------ 売上の直し */

type SaleRow = {
  id: string;
  store_id: string;
  sold_on: string;
  category: string;
  customer_name: string | null;
  member_kind: string | null;
  amount: number;
  tax_included: number | null;
  pay_method: string | null;
  memo: string | null;
  detail: Record<string, unknown> | null;
};

async function loadSale(actor: MoneyActor, id: string): Promise<SaleRow | null> {
  const { data } = await createAdmin()
    .from("mon_sales")
    .select("id, store_id, sold_on, category, customer_name, member_kind, amount, tax_included, pay_method, memo, detail")
    .eq("id", id).eq("company_id", actor.companyId).is("deleted_at", null)
    .maybeSingle();
  if (!data || !canWriteStore(actor, String(data.store_id))) return null;
  return data as SaleRow;
}

/** 既存の売上行 → updateSale の入力（触らない項目はそのまま渡す） */
function toUpdate(s: SaleRow): SaleUpdate {
  const d = s.detail ?? {};
  const g = (k: string) => (d[k] == null ? undefined : String(d[k]));
  const n = (k: string) => (d[k] == null ? null : Number(d[k]));
  return {
    id: s.id,
    soldOn: s.sold_on,
    category: s.category,
    customerName: s.customer_name ?? undefined,
    memberKind: s.member_kind ?? undefined,
    listPrice: n("list_price"),
    discount: n("discount"),
    amount: Number(s.amount),
    taxIncluded: s.tax_included == null ? null : Number(s.tax_included),
    payMethod: s.pay_method ?? undefined,
    productName: g("product_name"),
    itemType: g("item_type"),
    maker: g("maker"),
    seller: g("seller"),
    invItemId: g("inv_item_id"),
    qty: n("qty") ?? 1,
    pro: g("pro"),
    memo: s.memo ?? undefined,
  };
}

const addNote = (memo: string | null | undefined, note: string) => (memo ? `${memo} / ${note}` : note);

/** Airレジにあって money-os に無い明細を、【要確認】付きで売上に入れる（お客様名などはスタッフが後で記入） */
export async function addMissingSale(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const ym = str(formData.get("ym"));
  const store = await writableStore(actor);
  if (!store) back(ym, "この店舗には入力できません", true);

  const { data: l } = await createAdmin()
    .from("mon_airregi_lines")
    .select("tx_no, line_no, tx_date, tx_time, product_name, unit_price, qty, net, pay")
    .eq("id", str(formData.get("line_id"))).eq("store_id", store.id).maybeSingle();
  if (!l) back(ym, "Airレジの明細が見つかりません（取り込み直してください）", true);

  const qty = Number(l.qty) || 1;
  const net = Number(l.net);
  const unit = Number(l.unit_price);
  const perDiscount = Math.round(net / qty) - unit;
  const pays = String(l.pay ?? "").split("/").filter(Boolean);
  const r = await createSale({
    soldOn: String(l.tx_date),
    category: guessCategory(String(l.product_name)),
    amount: net,
    taxIncluded: withTax10(net),
    payMethod: pays[0] ?? undefined,
    productName: String(l.product_name),
    listPrice: unit || null,
    discount: perDiscount < 0 ? perDiscount : null,
    qty,
    memo: `${CHECK_MARK}Airレジから追加（${l.tx_date} ${l.tx_time ?? ""}の会計${pays.length > 1 ? `・支払 ${pays.join("＋")}` : ""}）。お客様名・商品の詳細を記入してください`,
  });
  if (!r.ok) back(ym, r.error, true);
  // 過去の日付で現金を足したときは残高を積み直す（createSale は末尾に積むだけ）
  await rebalanceCashLedger(actor.companyId, store.id);
  revalidatePath("/airregi");
  back(ym, `${l.product_name} を売上に追加しました。「記入まち」の欄でお客様名などを入れてください`);
}

/** 支払方法を Airレジに合わせる */
export async function fixPay(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const ym = str(formData.get("ym"));
  const s = await loadSale(actor, str(formData.get("sale_id")));
  const pay = str(formData.get("pay"));
  if (!s || !pay) back(ym, "売上が見つかりません", true);
  const before = s.pay_method ?? "（空）";
  await updateSale({ ...toUpdate(s), payMethod: pay, memo: addNote(s.memo, `Airレジ照合で支払方法を${before}→${pay}に修正`) });
  revalidatePath("/airregi");
  back(ym, `支払方法を ${pay} に直しました${pay === "現金" || before === "現金" ? "（レジのお金の記録も直しました）" : ""}`);
}

/** 個数・金額を Airレジに合わせる */
export async function fixAmount(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const ym = str(formData.get("ym"));
  const s = await loadSale(actor, str(formData.get("sale_id")));
  const qty = Number(str(formData.get("qty"))) || 1;
  const net = Number(str(formData.get("net")));
  if (!s || !net) back(ym, "売上が見つかりません", true);
  const u = toUpdate(s);
  await updateSale({
    ...u,
    qty,
    amount: net,
    taxIncluded: withTax10(net),
    memo: addNote(s.memo, `Airレジ照合で ${u.qty ?? 1}個 ${Number(s.amount).toLocaleString()}円 → ${qty}個 ${net.toLocaleString()}円 に修正`),
  });
  revalidatePath("/airregi");
  back(ym, `個数・金額を Airレジに合わせました（${qty}個・税抜${net.toLocaleString()}円）`);
}

/** 記入まちの売上に、お客様名・会員区分・商品名を入れる。「確認できた」なら【要確認】を外す */
export async function fillSale(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const ym = str(formData.get("ym"));
  const s = await loadSale(actor, str(formData.get("sale_id")));
  if (!s) back(ym, "売上が見つかりません", true);
  const u = toUpdate(s);
  let memo = str(formData.get("memo")) || undefined;
  const resolved = formData.get("resolved") === "1";
  if (resolved && memo?.startsWith(CHECK_MARK)) memo = memo.slice(CHECK_MARK.length).trim() || undefined;
  await updateSale({
    ...u,
    customerName: str(formData.get("customer_name")) || undefined,
    memberKind: str(formData.get("member_kind")) || undefined,
    productName: str(formData.get("product_name")) || undefined,
    category: str(formData.get("category")) || u.category,
    memo: resolved && memo ? `${memo}（確認: ${actor.name}）` : memo,
  });
  revalidatePath("/airregi");
  back(ym, resolved ? "確認済みにしました" : "保存しました");
}

/* ------------------------------------------------------------------ 確認済み（直さずOK） */

export async function markChecked(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const ym = str(formData.get("ym"));
  const store = await writableStore(actor);
  if (!store) back(ym, "この店舗には入力できません", true);
  const refKind = str(formData.get("ref_kind"));
  const ref = str(formData.get("ref"));
  const note = str(formData.get("note"));
  if (!note) back(ym, "「確認済み」にする理由を一言入れてください（例: Square端末だけで決済）", true);
  const { error } = await createAdmin().from("mon_airregi_checks").upsert(
    { company_id: actor.companyId, store_id: store.id, ref_kind: refKind, ref, note, checked_by: actor.name, checked_at: new Date().toISOString() },
    { onConflict: "store_id,ref_kind,ref" },
  );
  if (error) back(ym, `保存できませんでした: ${error.message}`, true);
  revalidatePath("/airregi");
  back(ym, "確認済みにしました");
}

export async function unmarkChecked(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const ym = str(formData.get("ym"));
  const store = await writableStore(actor);
  if (!store) back(ym, "この店舗には入力できません", true);
  await createAdmin().from("mon_airregi_checks").delete().eq("id", str(formData.get("id"))).eq("store_id", store.id);
  revalidatePath("/airregi");
  back(ym, "「確認済み」を取り消しました");
}

/* ------------------------------------------------------------------ レジからの出金 → 経費 */

/** Airレジの出金を「店の現金」の経費として入れる（科目は空＝本部が入れる。経費入力と同じ書き方） */
export async function addCashExpense(formData: FormData): Promise<void> {
  const actor = await requireMoneyActor();
  const ym = str(formData.get("ym"));
  const store = await writableStore(actor);
  if (!store) back(ym, "この店舗には入力できません", true);
  const admin = createAdmin();

  const { data: m } = await admin
    .from("mon_airregi_cash")
    .select("occurred_at, biz_date, amount, comment")
    .eq("id", str(formData.get("cash_id"))).eq("store_id", store.id).maybeSingle();
  if (!m) back(ym, "Airレジの出金が見つかりません", true);

  const amount = Math.abs(Number(m.amount));
  const item = str(formData.get("item")) || m.comment || "レジからの出金";
  const { data: e, error } = await admin
    .from("mon_expense")
    .insert({
      company_id: actor.companyId,
      store_id: store.id,
      segment_id: store.segmentId,
      spent_on: m.biz_date,
      item,
      amount,
      method: "cash",
      category: str(formData.get("category")) || null,
      memo: `Airレジの出金（${m.occurred_at}）から登録`,
      entered_by: actor.name,
      source: "app",
    })
    .select("id")
    .single();
  if (error || !e) back(ym, `保存できませんでした: ${error?.message ?? "unknown"}`, true);

  // 店の現金で払った＝現金出納にも出金を書く（経費入力と同じ。残高は直後に積み直す）
  await admin.from("mon_cash_ledger").insert({
    company_id: actor.companyId,
    store_id: store.id,
    segment_id: store.segmentId,
    entry_date: m.biz_date,
    summary: str(formData.get("category")) || "経費",
    description: item,
    in_amount: 0,
    out_amount: amount,
    balance: 0,
    memo: "経費入力から自動連携",
    entered_by: actor.name,
    source: "expense",
    source_ref: e.id,
  });
  await rebalanceCashLedger(actor.companyId, store.id);
  await admin.rpc("refresh_money_to_finance", { p_company_id: actor.companyId });
  revalidatePath("/airregi");
  revalidatePath("/expense");
  revalidatePath("/cash");
  back(ym, `${item} ${amount.toLocaleString()}円を経費（店の現金）に入れました。科目は本部が「経費を入れる」で設定します`);
}
