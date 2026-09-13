"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { getLaborRates, getQuote, lookupDemoShafts, searchProducts, type ProductRow } from "@/lib/craft";

const admin = () => createAdmin();

async function mustQuote(id: number) {
  const actor = await requireActor();
  const full = await getQuote(actor, id);
  if (!full) throw new Error("見積が見つかりません");
  return { actor, full };
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
// 表紙
// ---------------------------------------------------------------------------

export async function saveCover(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const { actor, full } = await mustQuote(id);

  await admin()
    .from("gw_quotes")
    .update({
      customer_name: txt(formData.get("customer_name")) ?? full.quote.customer_name,
      customer_contact: txt(formData.get("customer_contact")),
      fitting_date: txt(formData.get("fitting_date")),
      fitter_name: txt(formData.get("fitter_name")),
      fitting_menu: txt(formData.get("fitting_menu")),
      fitting_minutes: num(formData.get("fitting_minutes")),
      member_kind: String(formData.get("member_kind") ?? full.quote.member_kind),
      segment: String(formData.get("segment") ?? full.quote.segment),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", actor.companyId);

  // 試打11行。番号を入れたら、その場で商品マスタを引いて product_id を固定する
  const demoNos: number[] = [];
  for (const t of full.trials) {
    const v = num(formData.get(`demo_${t.line_no}`));
    if (v) demoNos.push(v);
  }
  const demoMap = await lookupDemoShafts(actor, demoNos);

  for (const t of full.trials) {
    const demoNo = num(formData.get(`demo_${t.line_no}`));
    const found = demoNo != null ? demoMap.get(demoNo) ?? null : null;
    await admin()
      .from("gw_fitting_trials")
      .update({
        demo_no: demoNo,
        product_id: found?.product?.id ?? null,
        head_name: txt(formData.get(`head_${t.line_no}`)),
        memo: txt(formData.get(`memo_${t.line_no}`)),
        updated_at: new Date().toISOString(),
      })
      .eq("id", t.id)
      .eq("company_id", actor.companyId);
  }

  revalidatePath(`/q/${id}`);
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

/** 表紙の試打行から、そのまま見積に入れる（転記をなくす一番の要） */
export async function adoptTrial(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const trialId = Number(formData.get("trial_id"));
  const { actor, full } = await mustQuote(id);
  const trial = full.trials.find((t) => t.id === trialId);
  if (!trial || !trial.product) return;

  await insertProductLine(id, actor.companyId, trial.product, { demoNo: trial.demo_no });
  await admin().from("gw_fitting_trials").update({ picked: true }).eq("id", trialId).eq("company_id", actor.companyId);
  revalidatePath(`/q/${id}/quote`);
  redirect(`/q/${id}/quote`);
}

/** 商品を探して入れる（試打していないグリップ・スリーブ・ボールなど） */
export async function addProductLine(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const productId = Number(formData.get("product_id"));
  const { actor } = await mustQuote(id);
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

/** 工賃・加工部品を入れる */
export async function addLaborLine(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const code = String(formData.get("labor_code") ?? "");
  const priceKind = String(formData.get("price_kind") ?? "price");
  const { actor } = await mustQuote(id);
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
  const { actor } = await mustQuote(id);
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
}

export async function removeItem(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const itemId = Number(formData.get("item_id"));
  const { actor } = await mustQuote(id);
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
  const { actor } = await mustQuote(id);
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
