"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { searchGuests, type GuestRow } from "@/lib/craft";

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

export async function createQuote(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const name = String(formData.get("customer_name") ?? "").trim();
  if (!name) return;

  const guestId = String(formData.get("guest_id") ?? "").trim() || null;
  const fittingDate = String(formData.get("fitting_date") ?? "").trim() || null;
  const fitterName = String(formData.get("fitter_name") ?? "").trim() || null;
  const memberKind = String(formData.get("member_kind") ?? "ビジター");
  const segment = String(formData.get("segment") ?? "visitor_no_fitting");
  const menu = String(formData.get("fitting_menu") ?? "").trim() || null;
  const minutesRaw = String(formData.get("fitting_minutes") ?? "").trim();
  const minutes = minutesRaw === "110" || minutesRaw === "55" ? Number(minutesRaw) : null;
  const storeId = String(formData.get("store_id") ?? "").trim() || null;

  const admin = createAdmin();
  const { data: seq } = await admin.rpc("gw_next_quote_seq", { p_company: actor.companyId });
  const n = Number(seq ?? 1);

  const { data, error } = await admin
    .from("gw_quotes")
    .insert({
      company_id: actor.companyId,
      store_id: storeId,
      quote_seq: n,
      quote_no: `Q-${String(n).padStart(4, "0")}`,
      guest_id: guestId,
      customer_name: name,
      customer_contact: String(formData.get("customer_contact") ?? "").trim() || null,
      member_kind: memberKind,
      segment,
      fitting_date: fittingDate,
      fitter_name: fitterName,
      fitting_menu: menu,
      fitting_minutes: minutes,
      staff_name: actor.name,
      created_by: actor.staffId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "見積を作成できませんでした");

  // 表紙は最初から11行ぶん枠を出す（紙と同じ）。空行は印刷でも空欄のまま
  await admin.from("gw_fitting_trials").insert(
    Array.from({ length: 11 }, (_, i) => ({
      company_id: actor.companyId,
      quote_id: data.id,
      line_no: i + 1,
    }))
  );

  revalidatePath("/");
  redirect(`/q/${data.id}`);
}
