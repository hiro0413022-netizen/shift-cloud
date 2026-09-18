"use server";

import { revalidatePath } from "next/cache";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { getLaborRates, getQuote, lookupDemoShafts, searchProducts, type ProductRow } from "@/lib/craft";
import { postSales } from "@/lib/sales";
import { afterSave } from "@/lib/after-save";

const admin = () => createAdmin();

async function mustQuote(id: number) {
  const actor = await requireActor();
  const full = await getQuote(actor, id);
  if (!full) throw new Error("伝票が見つかりません");
  return { actor, full };
}

/**
 * 行を足す・消すだけの操作用の軽い確認。
 * getQuote は明細も工房も割引ルールも読んで金額まで計算する（6往復）。
 * 1行足すたびにそれをやると、押してから画面が変わるまでが目に見えて遅い。
 * ここでは「その伝票が自分の会社のもので、自分の店舗から見えるか」だけを確かめる。
 */
async function assertQuote(id: number) {
  const actor = await requireActor();
  const { data } = await admin()
    .from("gw_quotes")
    .select("id, store_id")
    .eq("company_id", actor.companyId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) throw new Error("伝票が見つかりません");
  const q = data as { id: number; store_id: string | null };
  if (!actor.isOwner && q.store_id && !actor.storeIds.includes(q.store_id)) throw new Error("伝票が見つかりません");
  return { actor };
}

function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function txt(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

// ---------------------------------------------------------------------------
// 見積の明細
// ---------------------------------------------------------------------------

async function nextLineNo(quoteId: number): Promise<number> {
  const { data } = await admin().from("gw_quote_items").select("line_no").eq("quote_id", quoteId).order("line_no", { ascending: false }).limit(1);
  return ((data?.[0]?.line_no as number | undefined) ?? 0) + 1;
}

/** 商品マスタの1件を明細に入れる。定価はこの瞬間の値を写し取る（あとで値上げがあっても見積は動かない） */
async function insertProductLine(quoteId: number, companyId: string, p: ProductRow, opts: { demoNo?: number | null; lineKind?: string } = {}) {
  const kind =
    opts.lineKind ??
    (p.item_category === "グリップ" ? "grip" : p.item_category === "スリーブ" ? "sleeve" : "product");
  await admin().from("gw_quote_items").insert({
    company_id: companyId,
    quote_id: quoteId,
    line_no: await nextLineNo(quoteId),
    line_kind: kind,
    demo_no: opts.demoNo ?? null,
    product_id: p.id,
    item_category: p.item_category,
    manufacturer: p.manufacturer,
    product_name: p.name,
    spec: p.spec,
    club_type: p.club_type,
    list_price: p.list_price ?? 0,
    supplier_rate: p.default_rate,
    quantity: 1,
  });
}

/** 商品を探して入れる（試打していないグリップ・スリーブ・ボールなど） */
export async function addProductLine(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const productId = Number(formData.get("product_id"));
  const { actor } = await assertQuote(id);
  if (!productId) return;
  const { data } = await admin()
    .from("gw_products")
    .select("id, item_category, manufacturer, name, spec, club_type, list_price, default_rate, unit")
    .eq("company_id", actor.companyId)
    .eq("id", productId)
    .maybeSingle();
  if (!data) return;
  const p = data as ProductRow;
  await insertProductLine(id, actor.companyId, { ...p, list_price: p.list_price == null ? null : Number(p.list_price) });
  revalidatePath(`/q/${id}/quote`);
}

/**
 * 試打NOを打って入れる（2026-09-19 ユーザー要望「試打NO.の欄に番号を入れたら出るように」）。
 * 試打シャフト台帳（gw_demo_shafts）→ 商品マスタで商品名・メーカー・定価を引き、試打NOつきで明細に入れる。
 * 種類（DR/FW/UT）は台帳の値を優先（同じシャフトでも DR 用・FW 用で定価が違うため）。
 */
export async function addDemoLine(quoteId: number, demoNo: number): Promise<{ ok: boolean; message?: string }> {
  const { actor } = await assertQuote(quoteId);
  const n = Math.trunc(Number(demoNo));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, message: "試打NOを数字で入れてください" };
  const hit = (await lookupDemoShafts(actor, [n])).get(n);
  if (!hit) return { ok: false, message: `試打NO ${n} は試打シャフト台帳にありません` };
  if (!hit.product) {
    return {
      ok: false,
      message: `試打NO ${n}（${hit.import_name ?? "名前なし"}）は商品マスタにまだ紐づいていません。試打シャフト台帳で紐づけてください`,
    };
  }
  const p = hit.product;
  await insertProductLine(
    quoteId,
    actor.companyId,
    { ...p, club_type: hit.club_type ?? p.club_type, list_price: p.list_price == null ? null : Number(p.list_price) },
    { demoNo: n },
  );
  revalidatePath(`/q/${quoteId}/quote`);
  return { ok: true };
}

/** 工賃・加工部品を入れる */
export async function addLaborLine(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const code = String(formData.get("labor_code") ?? "");
  const priceKind = String(formData.get("price_kind") ?? "price");
  const { actor } = await assertQuote(id);
  const rates = await getLaborRates(actor);
  const r = rates.find((x) => x.code === code);
  if (!r) return;
  const price =
    priceKind === "bring_in" ? r.price_bring_in : priceKind === "no_purchase" ? r.price_no_purchase : r.price;

  await admin().from("gw_quote_items").insert({
    company_id: actor.companyId,
    quote_id: id,
    line_no: await nextLineNo(id),
    line_kind: r.quote_section === "加工部品" ? "coating" : "labor",
    labor_rate_id: r.id,
    item_category: r.discount_category,
    product_name: r.name,
    list_price: price ?? 0,
    quantity: 1,
  });
  revalidatePath(`/q/${id}/quote`);
}

/** マスタに無いものを手で入れる（Excelの自由度を殺さないための逃げ道。ここが無いと紙に戻る） */
export async function addFreeLine(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const { actor } = await assertQuote(id);
  const name = txt(formData.get("free_name"));
  if (!name) return;
  await admin().from("gw_quote_items").insert({
    company_id: actor.companyId,
    quote_id: id,
    line_no: await nextLineNo(id),
    line_kind: "free",
    item_category: txt(formData.get("free_category")),
    manufacturer: txt(formData.get("free_maker")),
    product_name: name,
    club_type: txt(formData.get("free_club_type")),
    list_price: num(formData.get("free_price")) ?? 0,
    quantity: num(formData.get("free_qty")) ?? 1,
    note: "商品マスタに無いため手入力。あとでマスタ登録を",
  });
  revalidatePath(`/q/${id}/quote`);
}

/** 明細の数量・掛け率・仕上げ長さを直す。掛け率を打ち替えたら「誰が・いつ・なぜ」を残す */
export async function updateItems(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const { actor, full } = await mustQuote(id);

  for (const it of full.items) {
    const qty = num(formData.get(`qty_${it.id}`)) ?? 1;
    const rateRaw = String(formData.get(`rate_${it.id}`) ?? "").trim();
    const reason = txt(formData.get(`reason_${it.id}`));
    const finish = num(formData.get(`finish_${it.id}`));
    const manual = rateRaw !== "" && rateRaw !== "auto";
    const rate = manual ? Number(rateRaw) : null;
    const changed = manual !== Boolean(it.discount_manual) || (manual && Number(it.discount_rate) !== rate);

    await admin()
      .from("gw_quote_items")
      .update({
        quantity: Math.max(1, Math.trunc(qty)),
        finish_length_inch: finish,
        discount_manual: manual,
        discount_rate: rate,
        discount_reason: manual ? reason : null,
        discount_by: manual && changed ? actor.staffId : it.discount_by,
        discount_at: manual && changed ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", it.id)
      .eq("company_id", actor.companyId);
  }

  await admin()
    .from("gw_quotes")
    .update({
      // 帳票の上で直接直せるようにした項目（件名・納期・支払条件・有効期限）
      subject: txt(formData.get("subject")) ?? full.quote.subject,
      delivery_note: txt(formData.get("delivery_note")) ?? full.quote.delivery_note,
      payment_terms: txt(formData.get("payment_terms")) ?? full.quote.payment_terms,
      validity_note: txt(formData.get("validity_note")) ?? full.quote.validity_note,
      // ご連絡先（紙の「ご連絡先：」欄）。欄が無いフォームから来たときは今の値を残す
      customer_contact: formData.has("customer_contact") ? txt(formData.get("customer_contact")) : full.quote.customer_contact,
      tax_free_amount: num(formData.get("tax_free_amount")) ?? 0,
      prepaid_amount: num(formData.get("prepaid_amount")) ?? 0,
      refund_auto: formData.get("refund_auto") === "on",
      refund_amount: formData.get("refund_auto") === "on" ? full.priced.refund.amount : num(formData.get("refund_amount")) ?? 0,
      refund_note: txt(formData.get("refund_note")),
      note: txt(formData.get("note")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", actor.companyId);

  revalidatePath(`/q/${id}/quote`);
  afterSave(formData, id);
}

/**
 * 明細を1行消す。
 *
 * ⚠ 消す行のIDは bind で渡すこと。ボタンに name/value を付けても届かない。
 *   React は formAction に関数を渡したボタンの name を自分用に使うので、
 *   こちらの name は上書きされて消える（React 19 の仕様。開発中しか警告が出ない）。
 *   実害: formData.get("item_id") が null → 0 行削除 → 200 が返るのに画面が変わらない（2026-09-13 実障害）
 */
export async function removeItem(itemId: number, formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  if (!itemId) return;
  const { actor } = await assertQuote(id);
  await admin().from("gw_quote_items").delete().eq("id", itemId).eq("company_id", actor.companyId);
  revalidatePath(`/q/${id}/quote`);
}

/** 社内チェック。「お客様にお渡しする前に、必ず他のスタッフのチェックを受けてから提示」を記録に残す */
export async function markReviewed(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const { actor, full } = await mustQuote(id);
  if (full.quote.created_by && full.quote.created_by === actor.staffId) {
    // 自分が作った見積を自分で承認できてしまうと、チェックの意味が無くなる
    throw new Error("ご自身で作られた見積は、他のスタッフに確認してもらってください");
  }
  await admin()
    .from("gw_quotes")
    .update({ status: "reviewed", reviewed_by: actor.staffId, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  revalidatePath(`/q/${id}/quote`);
}

export async function setStatus(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const status = String(formData.get("status") ?? "");
  const { actor } = await assertQuote(id);
  if (!["draft", "presented", "accepted", "void"].includes(status)) return;
  await admin().from("gw_quotes").update({ status, updated_at: new Date().toISOString() }).eq("id", id).eq("company_id", actor.companyId);
  revalidatePath(`/q/${id}/quote`);
}

export async function findProducts(
  _prev: { rows?: ProductRow[]; error?: string },
  formData: FormData
): Promise<{ rows?: ProductRow[]; error?: string }> {
  const actor = await requireActor();
  const q = String(formData.get("pq") ?? "");
  const category = String(formData.get("pcat") ?? "") || null;
  try {
    return { rows: await searchProducts(actor, q, { category }) };
  } catch {
    return { error: "検索できませんでした" };
  }
}

/**
 * 御見積書を発行した、という記録。
 * 2026-09-13 ユーザー判断：注文書だけで済ませることが多いので、見積書は出したときだけ印をつける。
 */
export async function issueQuoteDoc(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const { actor } = await assertQuote(id);
  await admin()
    .from("gw_quotes")
    .update({ quote_issued_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  revalidatePath(`/q/${id}/quote`);
}

/**
 * 工房を通さない伝票（グリップだけ等）の売上計上。
 * 工房がある伝票は、お渡し日を入れた時点で自動的に計上される。
 */
export async function postSalesNow(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const { actor } = await mustQuote(id);
  await postSales(actor, id);
  revalidatePath(`/q/${id}/quote`);
}
