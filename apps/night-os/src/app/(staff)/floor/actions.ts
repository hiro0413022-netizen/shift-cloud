"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { businessDate, getActiveRules, resolveNightStore } from "@/lib/night";

/** ご案内（新しい伝票を開く）。同じ卓に2枚開かないのはDBの一意索引が最後の砦 */
export async function openSlip(formData: FormData) {
  const actor = await requireActor();
  const store = await resolveNightStore();
  if (!store) throw new Error("店舗が見つかりません");

  const tableId = String(formData.get("tableId") ?? "");
  const guests = Math.max(1, Number(formData.get("guests") ?? 1));
  const broughtByCastId = String(formData.get("broughtByCastId") ?? "") || null;
  const broughtKind = String(formData.get("broughtKind") ?? "free") as "douhan" | "referral" | "free";

  const { rules } = await getActiveRules(store.id);
  const admin = createAdmin();

  const { data: slip, error } = await admin
    .from("nite_slips")
    .insert({
      company_id: store.companyId,
      store_id: store.id,
      table_id: tableId,
      business_date: businessDate(),
      guests,
      set_minutes: rules.price.setMinutes,
      brought_by_cast_id: broughtByCastId,
      brought_kind: broughtByCastId ? broughtKind : "free",
      created_by: actor.staffId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // セット料金は開いた時点で1行入れる（あとで人数を直したらこの行を作り直す）
  await admin.from("nite_slip_items").insert({
    company_id: store.companyId,
    store_id: store.id,
    slip_id: slip.id,
    kind: "set",
    label: `セット料金 ${rules.price.setMinutes}分`,
    unit_price: rules.price.setPerGuest,
    qty: guests,
    amount: rules.price.setPerGuest * guests,
    created_by: actor.staffId,
  });

  // 同伴で来られた場合は、同伴の売上とバックもその場で立てる（あとで入れ忘れない）
  if (broughtByCastId && broughtKind === "douhan") {
    await admin.from("nite_slip_items").insert({
      company_id: store.companyId,
      store_id: store.id,
      slip_id: slip.id,
      kind: "douhan",
      label: "同伴",
      unit_price: rules.price.douhan,
      qty: 1,
      amount: rules.price.douhan,
      cast_id: broughtByCastId,
      back_amount: rules.nominationBack.douhan,
      back_basis: { rule: "douhan", label: "同伴", kind: "fixed", value: rules.nominationBack.douhan, base: rules.price.douhan },
      created_by: actor.staffId,
    });
  }

  redirect(`/slips/${slip.id}`);
}

/** お会計。担当キャストが空の明細が残っているとDBのトリガーが弾く（trg_nite_slip_close_guard） */
export async function closeSlip(formData: FormData) {
  const actor = await requireActor();
  const store = await resolveNightStore();
  if (!store) throw new Error("店舗が見つかりません");

  const slipId = String(formData.get("slipId") ?? "");
  const paymentMethod = String(formData.get("paymentMethod") ?? "cash");
  const { rules } = await getActiveRules(store.id);
  const admin = createAdmin();

  const { data: items } = await admin
    .from("nite_slip_items")
    .select("amount, status")
    .eq("slip_id", slipId);
  const subtotal = ((items ?? []) as Array<{ amount: number; status: string }>)
    .filter((i) => i.status !== "void")
    .reduce((s, i) => s + i.amount, 0);
  const serviceCharge = Math.floor(subtotal * rules.serviceRate);
  const tax = Math.floor((subtotal + serviceCharge) * rules.taxRate);

  const { error } = await admin
    .from("nite_slips")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by: actor.staffId,
      subtotal,
      service_charge: serviceCharge,
      service_rate: rules.serviceRate,
      tax,
      tax_rate: rules.taxRate,
      total: subtotal + serviceCharge + tax,
      payment_method: paymentMethod,
    })
    .eq("id", slipId);
  if (error) throw new Error(error.message);

  revalidatePath("/floor");
  redirect("/floor");
}

/** 出勤・退勤。時給は「その日の基準額」をここで焼き付ける（あとでランクを変えても過去は動かない） */
export async function toggleAttendance(formData: FormData) {
  await requireActor();
  const store = await resolveNightStore();
  if (!store) throw new Error("店舗が見つかりません");

  const castId = String(formData.get("castId") ?? "");
  const baseWage = Number(formData.get("baseWage") ?? 0);
  const date = businessDate();
  const admin = createAdmin();

  const { data: existing } = await admin
    .from("nite_attendances")
    .select("id, clock_in, clock_out")
    .eq("cast_id", castId)
    .eq("business_date", date)
    .is("deleted_at", null)
    .maybeSingle();

  const now = new Date();
  if (!existing) {
    await admin.from("nite_attendances").insert({
      company_id: store.companyId,
      store_id: store.id,
      cast_id: castId,
      business_date: date,
      clock_in: now.toISOString(),
      minutes: 0,
      hourly_wage_base: baseWage,
      hourly_wage_applied: baseWage,
    });
  } else if (!existing.clock_out) {
    const minutes = existing.clock_in
      ? Math.max(0, Math.round((now.getTime() - new Date(existing.clock_in).getTime()) / 60000))
      : 0;
    await admin
      .from("nite_attendances")
      .update({ clock_out: now.toISOString(), minutes })
      .eq("id", existing.id);
  } else {
    // 退勤済みからもう一度押されたら、戻って出勤中に直す（押し間違いの救済）
    await admin.from("nite_attendances").update({ clock_out: null }).eq("id", existing.id);
  }
  revalidatePath("/floor");
  revalidatePath("/owner");
}
