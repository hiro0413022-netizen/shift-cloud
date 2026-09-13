"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { getFitting, lookupDemoShafts } from "@/lib/craft";
import { createQuoteRow } from "@/app/actions";

const admin = () => createAdmin();

async function mustFitting(id: number) {
  const actor = await requireActor();
  const full = await getFitting(actor, id);
  if (!full) throw new Error("表紙が見つかりません");
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

/** 表紙を保存する。試打NOを入れたら、その場で商品マスタを引いて product_id を固定する */
export async function saveCover(formData: FormData): Promise<void> {
  const id = Number(formData.get("fitting_id"));
  const { actor, full } = await mustFitting(id);

  await admin()
    .from("gw_fittings")
    .update({
      customer_name: txt(formData.get("customer_name")) ?? full.fitting.customer_name,
      customer_contact: txt(formData.get("customer_contact")),
      fitting_date: txt(formData.get("fitting_date")) ?? full.fitting.fitting_date,
      fitter_name: txt(formData.get("fitter_name")),
      fitting_menu: txt(formData.get("fitting_menu")),
      fitting_minutes: num(formData.get("fitting_minutes")),
      member_kind: String(formData.get("member_kind") ?? full.fitting.member_kind),
      segment: String(formData.get("segment") ?? full.fitting.segment),
      note: txt(formData.get("note")),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", actor.companyId);

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
        picked: formData.get(`picked_${t.line_no}`) === "on",
        updated_at: new Date().toISOString(),
      })
      .eq("id", t.id)
      .eq("company_id", actor.companyId);
  }

  revalidatePath(`/f/${id}`);
}

async function nextLineNo(quoteId: number): Promise<number> {
  const { data } = await admin()
    .from("gw_quote_items")
    .select("line_no")
    .eq("quote_id", quoteId)
    .order("line_no", { ascending: false })
    .limit(1);
  return ((data?.[0]?.line_no as number | undefined) ?? 0) + 1;
}

/**
 * 表紙から伝票をつくる。
 * 採用にチェックの入った試打シャフトを、そのまま明細に写す（転記をなくす一番の要）。
 * 定価はこの瞬間のマスタの値を写し取る（あとで値上げがあっても、出した伝票は動かない）。
 */
export async function makeQuoteFromFitting(formData: FormData): Promise<void> {
  const id = Number(formData.get("fitting_id"));
  const onlyPicked = formData.get("only_picked") === "1";
  const { actor, full } = await mustFitting(id);
  const f = full.fitting;

  const quoteId = await createQuoteRow(actor, {
    storeId: f.store_id,
    fittingId: f.id,
    guestId: f.guest_id,
    customerName: f.customer_name,
    customerContact: f.customer_contact,
    memberKind: f.member_kind,
    segment: f.segment,
  });

  if (onlyPicked) {
    const rows = full.trials.filter((t) => t.picked && t.product);
    let line = 1;
    for (const t of rows) {
      const p = t.product!;
      await admin()
        .from("gw_quote_items")
        .insert({
          company_id: actor.companyId,
          quote_id: quoteId,
          line_no: line,
          line_kind: p.item_category === "グリップ" ? "grip" : p.item_category === "スリーブ" ? "sleeve" : "product",
          demo_no: t.demo_no,
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
      line += 1;
    }
  }

  await admin().from("gw_fittings").update({ status: "quoted" }).eq("id", id).eq("company_id", actor.companyId);

  revalidatePath(`/f/${id}`);
  revalidatePath("/");
  redirect(`/q/${quoteId}/quote`);
}

/** 既にある伝票に、表紙の試打シャフトを1本入れる */
export async function adoptTrialInto(formData: FormData): Promise<void> {
  const fittingId = Number(formData.get("fitting_id"));
  const quoteId = Number(formData.get("quote_id"));
  const trialId = Number(formData.get("trial_id"));
  const { actor, full } = await mustFitting(fittingId);
  const t = full.trials.find((x) => x.id === trialId);
  if (!t?.product || !quoteId) return;
  if (!full.quotes.some((q) => q.id === quoteId)) return; // この表紙の伝票だけ

  const p = t.product;
  await admin()
    .from("gw_quote_items")
    .insert({
      company_id: actor.companyId,
      quote_id: quoteId,
      line_no: await nextLineNo(quoteId),
      line_kind: p.item_category === "グリップ" ? "grip" : p.item_category === "スリーブ" ? "sleeve" : "product",
      demo_no: t.demo_no,
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
  await admin().from("gw_fitting_trials").update({ picked: true }).eq("id", trialId).eq("company_id", actor.companyId);

  revalidatePath(`/q/${quoteId}/quote`);
  redirect(`/q/${quoteId}/quote`);
}
