"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { searchGuests, type GuestRow } from "@/lib/craft";

/**
 * 入口は2つある。
 *
 *   表紙（gw_fittings） … フィッティング時にお客様へお渡しする紙。試打の行はここ。
 *   伝票（gw_quotes）   … 見積／注文。表紙が無くても作れる（グリップ交換だけ等）。
 *
 * 2026-09-13 ユーザー判断：
 *   ・注文書だけで済ませることが多いので、伝票は見積書を出さなくても完結できる
 *   ・1回のフィッティングから伝票が複数に分かれることがある（表紙 1 : 伝票 N）
 */

const admin = () => createAdmin();

/** お客様をお名前で探す（6,261人から選ぶだけにして、毎回書かせない） */
export async function findGuests(
  _prev: { rows?: GuestRow[]; error?: string },
  formData: FormData
): Promise<{ rows?: GuestRow[]; error?: string }> {
  const actor = await requireActor();
  const q = String(formData.get("q") ?? "").trim();
  if (!q) return { rows: [] };
  try {
    return { rows: await searchGuests(actor, q) };
  } catch {
    return { error: "検索できませんでした" };
  }
}

function txt(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function jstYear(date: string | null): number {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return Number(date.slice(0, 4));
  return Number(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 4));
}

const two = (n: number) => String(n % 100).padStart(2, "0");
const four = (n: number) => String(n).padStart(4, "0");

// ---------------------------------------------------------------------------
// 表紙をつくる
// ---------------------------------------------------------------------------

export async function createFitting(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const name = txt(formData.get("customer_name"));
  if (!name) return;

  const fittingDate =
    txt(formData.get("fitting_date")) ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const year = jstYear(fittingDate);
  const minutesRaw = String(formData.get("fitting_minutes") ?? "").trim();
  const minutes = minutesRaw === "110" || minutesRaw === "55" ? Number(minutesRaw) : null;

  const { data: seq } = await admin().rpc("gw_next_fitting_seq", { p_company: actor.companyId, p_year: year });
  const n = Number(seq ?? 1);

  const { data, error } = await admin()
    .from("gw_fittings")
    .insert({
      company_id: actor.companyId,
      store_id: txt(formData.get("store_id")),
      seq_year: year,
      fitting_seq: n,
      fitting_no: `F${two(year)}-${four(n)}`,
      guest_id: txt(formData.get("guest_id")),
      customer_name: name,
      customer_contact: txt(formData.get("customer_contact")),
      member_kind: String(formData.get("member_kind") ?? "ビジター"),
      segment: String(formData.get("segment") ?? "visitor_no_fitting"),
      fitting_date: fittingDate,
      fitter_name: txt(formData.get("fitter_name")),
      fitting_menu: txt(formData.get("fitting_menu")),
      fitting_minutes: minutes,
      created_by: actor.staffId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "表紙を作成できませんでした");

  // 試打は最初から11行ぶん枠を出す（紙と同じ）。空行は印刷でも空欄のまま
  await admin()
    .from("gw_fitting_trials")
    .insert(
      Array.from({ length: 11 }, (_, i) => ({
        company_id: actor.companyId,
        fitting_id: data.id,
        line_no: i + 1,
      }))
    );

  revalidatePath("/");
  revalidatePath("/f");
  redirect(`/f/${data.id}`);
}

// ---------------------------------------------------------------------------
// 伝票をつくる
// ---------------------------------------------------------------------------

/**
 * 伝票を1件つくる。fitting_id は任意。
 * 表紙から呼ぶときは、お客様情報を表紙から引き継ぐ（毎回書かせない）。
 */
export async function createQuoteRow(
  actor: { companyId: string; staffId: string | null; name: string },
  input: {
    storeId?: string | null;
    fittingId?: number | null;
    guestId?: string | null;
    customerName: string;
    customerContact?: string | null;
    memberKind?: string;
    segment?: string;
    quoteDate?: string | null;
  }
): Promise<number> {
  const quoteDate = input.quoteDate ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  const year = jstYear(quoteDate);
  const { data: seq } = await admin().rpc("gw_next_quote_seq", { p_company: actor.companyId, p_year: year });
  const n = Number(seq ?? 1);

  const { data, error } = await admin()
    .from("gw_quotes")
    .insert({
      company_id: actor.companyId,
      store_id: input.storeId ?? null,
      seq_year: year,
      quote_seq: n,
      quote_no: `${two(year)}-${four(n)}`,
      fitting_id: input.fittingId ?? null,
      guest_id: input.guestId ?? null,
      customer_name: input.customerName,
      customer_contact: input.customerContact ?? null,
      member_kind: input.memberKind ?? "ビジター",
      segment: input.segment ?? "visitor_no_fitting",
      quote_date: quoteDate,
      staff_name: actor.name,
      created_by: actor.staffId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "伝票を作成できませんでした");
  return data.id as number;
}

/** 表紙を伴わない伝票（グリップ交換だけ、ボールだけ、など） */
export async function createQuote(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const name = txt(formData.get("customer_name"));
  if (!name) return;

  const id = await createQuoteRow(actor, {
    storeId: txt(formData.get("store_id")),
    guestId: txt(formData.get("guest_id")),
    customerName: name,
    customerContact: txt(formData.get("customer_contact")),
    memberKind: String(formData.get("member_kind") ?? "ビジター"),
    segment: String(formData.get("segment") ?? "visitor_no_fitting"),
  });

  revalidatePath("/");
  redirect(`/q/${id}/quote`);
}
