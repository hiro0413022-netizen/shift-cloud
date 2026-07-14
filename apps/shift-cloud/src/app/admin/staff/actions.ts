"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor, loginIdToEmail } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

const staffSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  name: z.string().min(1),
  name_kana: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  login_id: z.string().optional(),
  password: z.string().optional(),
  employment_type: z.enum(["fulltime", "parttime", "contractor", "lesson_pro"]),
  position: z.string().optional(),
  // 店舗なしも許可（役員・本部スタッフは店舗に立たない / 2026-07-13）
  store_ids: z.array(z.string().uuid()),
  primary_store_id: z.string().uuid().optional().or(z.literal("")),
  role_id: z.string().uuid(),
  hourly_wage: z.coerce.number().int().min(0).optional(),
  commute_allowance: z.coerce.number().int().min(0).default(0),
});

export async function saveStaff(formData: FormData): Promise<{ error?: string }> {
  const actor = await requireActor("manage_staff");
  const admin = createAdmin();

  const parsed = staffSchema.safeParse({
    id: formData.get("id") || "",
    name: formData.get("name"),
    name_kana: formData.get("name_kana") || undefined,
    email: formData.get("email") || "",
    login_id: formData.get("login_id") || undefined,
    password: formData.get("password") || undefined,
    employment_type: formData.get("employment_type"),
    position: formData.get("position") || undefined,
    store_ids: formData.getAll("store_ids").map(String),
    primary_store_id: formData.get("primary_store_id"),
    role_id: formData.get("role_id"),
    hourly_wage: formData.get("hourly_wage") || undefined,
    commute_allowance: formData.get("commute_allowance") || 0,
  });
  if (!parsed.success) return { error: "入力内容を確認してください" };
  const d = parsed.data;
  if (!d.email && !d.login_id) return { error: "メールアドレスかログインIDのいずれかが必要です" };

  let staffId = d.id || null;

  if (!staffId) {
    // 新規: Authユーザー作成
    if (!d.password || d.password.length < 8) return { error: "初期パスワード（8文字以上）が必要です" };
    const authEmail = d.email || loginIdToEmail(d.login_id!);
    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
      email: authEmail,
      password: d.password,
      email_confirm: true,
    });
    if (authErr) return { error: `認証ユーザー作成失敗: ${authErr.message}` };

    const { data: staff, error } = await admin
      .from("staff")
      .insert({
        company_id: actor.companyId,
        auth_user_id: authUser.user.id,
        name: d.name,
        name_kana: d.name_kana,
        email: d.email || null,
        login_id: d.login_id || null,
        employment_type: d.employment_type,
        position: d.position,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    staffId = staff.id;
    await logAudit(actor, "staff.create", "staff", staffId, null, d);
  } else {
    const { data: before } = await admin.from("staff").select("*").eq("id", staffId).single();
    const { error } = await admin
      .from("staff")
      .update({
        name: d.name,
        name_kana: d.name_kana,
        email: d.email || null,
        login_id: d.login_id || null,
        employment_type: d.employment_type,
        position: d.position,
      })
      .eq("id", staffId)
      .eq("company_id", actor.companyId);
    if (error) return { error: error.message };
    if (d.password && d.password.length >= 8 && before?.auth_user_id) {
      await admin.auth.admin.updateUserById(before.auth_user_id, { password: d.password });
    }
    await logAudit(actor, "staff.update", "staff", staffId, before, d);
  }

  // 店舗割当を置き換え（店舗なし=役員・本部は割当ゼロでOK）
  await admin.from("staff_store_assignments").delete().eq("staff_id", staffId);
  if (d.store_ids.length > 0) {
    const primary = d.primary_store_id && d.store_ids.includes(d.primary_store_id) ? d.primary_store_id : d.store_ids[0];
    await admin.from("staff_store_assignments").insert(
      d.store_ids.map((sid) => ({
        company_id: actor.companyId,
        staff_id: staffId,
        store_id: sid,
        is_primary: sid === primary,
      }))
    );
  }

  // ロールを置き換え
  await admin.from("staff_roles").delete().eq("staff_id", staffId);
  await admin.from("staff_roles").insert({
    company_id: actor.companyId,
    staff_id: staffId,
    role_id: d.role_id,
    scope_type: "company",
  });

  // 時給: 現在値と異なれば履歴追加
  if (d.hourly_wage !== undefined) {
    const { data: cur } = await admin
      .from("staff_wages")
      .select("hourly_wage, commute_allowance")
      .eq("staff_id", staffId)
      .is("deleted_at", null)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cur || cur.hourly_wage !== d.hourly_wage || cur.commute_allowance !== d.commute_allowance) {
      await admin.from("staff_wages").insert({
        company_id: actor.companyId,
        staff_id: staffId,
        hourly_wage: d.hourly_wage,
        commute_allowance: d.commute_allowance,
        effective_from: new Date().toISOString().slice(0, 10),
      });
      await logAudit(actor, "staff.wage_change", "staff_wages", staffId, cur, {
        hourly_wage: d.hourly_wage,
        commute_allowance: d.commute_allowance,
      });
    }
  }

  revalidatePath("/admin/staff");
  return {};
}

export async function deactivateStaff(formData: FormData) {
  const actor = await requireActor("manage_staff");
  const admin = createAdmin();
  const id = String(formData.get("id"));
  const { data: before } = await admin.from("staff").select("status").eq("id", id).single();
  const next = before?.status === "active" ? "inactive" : "active";
  await admin.from("staff").update({ status: next }).eq("id", id).eq("company_id", actor.companyId);
  await logAudit(actor, `staff.${next}`, "staff", id, before, { status: next });
  revalidatePath("/admin/staff");
}
