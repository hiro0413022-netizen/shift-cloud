"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { generateToken, hashToken } from "@/lib/intake";
import { logAudit } from "@/lib/kernel";
import { FRUNK_STORE_CODE } from "@/lib/frunk";

function str(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function orNull(v: FormDataEntryValue | null): string | null {
  const s = str(v);
  return s === "" ? null : s;
}
function intOrNull(v: FormDataEntryValue | null): number | null {
  const s = str(v).replace(/[^\d-]/g, "");
  if (s === "") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}
const today = () => new Date().toISOString().slice(0, 10);

async function frunkStoreId(admin: ReturnType<typeof createAdmin>, companyId: string): Promise<string | null> {
  const { data } = await admin
    .from("stores").select("id").eq("company_id", companyId).eq("code", FRUNK_STORE_CODE).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// ---- プラン管理 ----
export async function createPlan(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const name = str(formData.get("name"));
  if (!name) redirect("/frunk?err=" + encodeURIComponent("プラン名を入力してください"));
  await admin.from("frunk_plans").insert({
    company_id: actor.companyId,
    store_id: await frunkStoreId(admin, actor.companyId),
    name,
    monthly_price: intOrNull(formData.get("monthly_price")),
    joining_fee: intOrNull(formData.get("joining_fee")),
    max_bookings_per_day: intOrNull(formData.get("max_bookings_per_day")),
    max_bookings_per_week: intOrNull(formData.get("max_bookings_per_week")),
    sort_order: intOrNull(formData.get("sort_order")) ?? 0,
    note: orNull(formData.get("note")),
  });
  revalidatePath("/frunk");
}

export async function updatePlan(formData: FormData) {
  await requireReceptionActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  await admin.from("frunk_plans").update({
    name: str(formData.get("name")) || "（無名プラン）",
    monthly_price: intOrNull(formData.get("monthly_price")),
    joining_fee: intOrNull(formData.get("joining_fee")),
    max_bookings_per_day: intOrNull(formData.get("max_bookings_per_day")),
    max_bookings_per_week: intOrNull(formData.get("max_bookings_per_week")),
    sort_order: intOrNull(formData.get("sort_order")) ?? 0,
    active: str(formData.get("active")) === "1",
    note: orNull(formData.get("note")),
  }).eq("id", id);
  revalidatePath("/frunk");
}

export async function deletePlan(formData: FormData) {
  await requireReceptionActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  await admin.from("frunk_plans").update({ deleted_at: new Date().toISOString(), active: false }).eq("id", id);
  revalidatePath("/frunk");
}

// ---- 入会申込の承認 / 却下 ----
export async function approveSignup(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  let memberNo = str(formData.get("member_no"));
  if (!memberNo) {
    const { count } = await admin
      .from("frunk_members").select("id", { count: "exact", head: true })
      .eq("company_id", actor.companyId).not("member_no", "is", null);
    memberNo = `FR${String((count ?? 0) + 1).padStart(4, "0")}`;
  }
  await admin.from("frunk_members").update({
    status: "active",
    member_no: memberNo,
    join_date: str(formData.get("start_date")) || today(),
    reviewed_by: actor.staffId,
    reviewed_at: new Date().toISOString(),
  }).eq("id", id);
  await logAudit(actor, "frunk.signup_approve", "frunk_members", null, null, { id, member_no: memberNo });
  revalidatePath("/frunk");
}

export async function rejectSignup(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  if (!id) return;
  await admin.from("frunk_members").update({
    status: "rejected", reviewed_by: actor.staffId, reviewed_at: new Date().toISOString(),
  }).eq("id", id);
  revalidatePath("/frunk");
}

// ---- 会員ステータス変更（休会・復帰・退会） ----
export async function setMemberStatus(formData: FormData) {
  await requireReceptionActor();
  const admin = createAdmin();
  const id = str(formData.get("id"));
  const to = str(formData.get("to"));
  if (!id || !["active", "suspended", "left"].includes(to)) return;
  const patch: Record<string, unknown> = { status: to };
  if (to === "suspended") patch.suspend_start = today();
  if (to === "active") patch.suspend_end = today();
  if (to === "left") patch.leave_date = today();
  await admin.from("frunk_members").update(patch).eq("id", id);
  revalidatePath("/frunk");
}

// ---- 入会フォームURL発行 ----
export async function issueSignupToken(formData: FormData) {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const storeId = await frunkStoreId(admin, actor.companyId);
  await admin.from("frunk_signup_tokens").update({ active: false })
    .eq("company_id", actor.companyId).eq("active", true);
  const raw = generateToken();
  await admin.from("frunk_signup_tokens").insert({
    company_id: actor.companyId, store_id: storeId,
    token_hash: hashToken(raw), label: orNull(formData.get("label")) ?? "FRANK 入会タブレット",
  });
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  redirect(`/frunk?signup_url=${encodeURIComponent(`${proto}://${host}/join/${raw}`)}`);
}
