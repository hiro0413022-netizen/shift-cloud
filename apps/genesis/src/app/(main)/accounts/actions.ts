"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireGenesisActor, type GenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";

/** ログインID→擬似メール変換（Shift Cloudと同一規約 / DECISIONS #2） */
function loginIdToEmail(loginId: string) {
  return `${loginId.toLowerCase()}@staff.yozan.internal`;
}

/** 全ミューテーションで監査ログを残す（audit_logs / API_STANDARD） */
async function logAudit(
  actor: GenesisActor,
  action: string,
  recordId: string | null,
  before: unknown = null,
  after: unknown = null
) {
  const admin = createAdmin();
  await admin.from("audit_logs").insert({
    company_id: actor.companyId,
    actor_staff_id: actor.staffId,
    actor_type: "human",
    action,
    table_name: "staff",
    record_id: recordId,
    before,
    after,
  });
}

/**
 * アカウント管理は view_hq（requireGenesisActor）に加え manage_staff を必須にする。
 * 権限データはShift Cloudと共通（同一DB）。
 */
async function requireManageStaff(): Promise<GenesisActor> {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const { data: roleRows } = await admin
    .from("staff_roles")
    .select("roles(permissions)")
    .eq("staff_id", actor.staffId)
    .is("deleted_at", null);
  const ok = (roleRows ?? []).some((row) => {
    const perms = (row as unknown as { roles: { permissions: Record<string, boolean> } | null })
      .roles?.permissions;
    return !!perms?.manage_staff;
  });
  if (!ok) throw new Error("この操作には manage_staff 権限が必要です");
  return actor;
}

/** 役割を付与（1スタッフ1役割 / company スコープ・置き換え） */
export async function assignRole(formData: FormData): Promise<{ error?: string }> {
  const actor = await requireManageStaff();
  const admin = createAdmin();
  const staffId = z.string().uuid().safeParse(formData.get("staff_id"));
  const roleId = z.string().uuid().safeParse(formData.get("role_id"));
  if (!staffId.success || !roleId.success) return { error: "入力を確認してください" };

  const { data: before } = await admin
    .from("staff_roles")
    .select("role_id")
    .eq("staff_id", staffId.data)
    .is("deleted_at", null);
  await admin.from("staff_roles").delete().eq("staff_id", staffId.data);
  const { error } = await admin.from("staff_roles").insert({
    company_id: actor.companyId,
    staff_id: staffId.data,
    role_id: roleId.data,
    scope_type: "company",
  });
  if (error) return { error: error.message };
  await logAudit(actor, "staff.role_change", staffId.data, before, { role_id: roleId.data });
  revalidatePath("/accounts");
  return {};
}

/** 有効/停止の切替（active ↔ inactive・全システム一括） */
export async function toggleStatus(formData: FormData): Promise<{ error?: string }> {
  const actor = await requireManageStaff();
  const admin = createAdmin();
  const id = String(formData.get("staff_id"));
  const { data: before } = await admin.from("staff").select("status").eq("id", id).single();
  const next = before?.status === "active" ? "inactive" : "active";
  const { error } = await admin
    .from("staff")
    .update({ status: next })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  if (error) return { error: error.message };
  await logAudit(actor, `staff.${next}`, id, before, { status: next });
  revalidatePath("/accounts");
  return {};
}

/** ログイン発行（既存スタッフにAuthアカウントを作成して紐付け） */
export async function issueLogin(formData: FormData): Promise<{ error?: string }> {
  const actor = await requireManageStaff();
  const admin = createAdmin();
  const parsed = z
    .object({
      staff_id: z.string().uuid(),
      login_id: z.string().min(3).regex(/^[a-zA-Z0-9._@-]+$/, "英数字と . _ @ - のみ"),
      password: z.string().min(8, "8文字以上"),
    })
    .safeParse({
      staff_id: formData.get("staff_id"),
      login_id: String(formData.get("login_id") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力を確認してください" };
  const d = parsed.data;

  const { data: staff } = await admin
    .from("staff")
    .select("id, auth_user_id, email")
    .eq("id", d.staff_id)
    .eq("company_id", actor.companyId)
    .single();
  if (!staff) return { error: "スタッフが見つかりません" };
  if (staff.auth_user_id) return { error: "既にログインが発行済みです（リセットをご利用ください）" };

  const authEmail = staff.email || loginIdToEmail(d.login_id);
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: authEmail,
    password: d.password,
    email_confirm: true,
  });
  if (authErr) return { error: `認証ユーザー作成失敗: ${authErr.message}` };

  const { error } = await admin
    .from("staff")
    .update({ auth_user_id: authUser.user.id, login_id: d.login_id })
    .eq("id", d.staff_id)
    .eq("company_id", actor.companyId);
  if (error) return { error: error.message };
  await logAudit(actor, "staff.login_issued", d.staff_id, null, { login_id: d.login_id });
  revalidatePath("/accounts");
  return {};
}

/** パスワード再発行 */
export async function resetPassword(formData: FormData): Promise<{ error?: string }> {
  const actor = await requireManageStaff();
  const admin = createAdmin();
  const parsed = z
    .object({ staff_id: z.string().uuid(), password: z.string().min(8, "8文字以上") })
    .safeParse({ staff_id: formData.get("staff_id"), password: String(formData.get("password") ?? "") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力を確認してください" };

  const { data: staff } = await admin
    .from("staff")
    .select("auth_user_id")
    .eq("id", parsed.data.staff_id)
    .eq("company_id", actor.companyId)
    .single();
  if (!staff?.auth_user_id) return { error: "この人はまだログイン未発行です" };
  const { error } = await admin.auth.admin.updateUserById(staff.auth_user_id, {
    password: parsed.data.password,
  });
  if (error) return { error: error.message };
  await logAudit(actor, "staff.password_reset", parsed.data.staff_id);
  revalidatePath("/accounts");
  return {};
}

/** 新規スタッフを追加（Authアカウント＋staff＋役割） */
export async function createStaff(formData: FormData): Promise<{ error?: string }> {
  const actor = await requireManageStaff();
  const admin = createAdmin();
  const parsed = z
    .object({
      name: z.string().min(1, "氏名は必須です"),
      name_kana: z.string().optional(),
      login_id: z.string().min(3).regex(/^[a-zA-Z0-9._@-]+$/, "英数字と . _ @ - のみ"),
      password: z.string().min(8, "8文字以上"),
      employment_type: z.enum(["fulltime", "parttime", "contractor", "lesson_pro"]),
      role_id: z.string().uuid(),
      position: z.string().optional(),
    })
    .safeParse({
      name: String(formData.get("name") ?? "").trim(),
      name_kana: String(formData.get("name_kana") ?? "").trim() || undefined,
      login_id: String(formData.get("login_id") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
      employment_type: formData.get("employment_type"),
      role_id: formData.get("role_id"),
      position: String(formData.get("position") ?? "").trim() || undefined,
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "入力を確認してください" };
  const d = parsed.data;

  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: loginIdToEmail(d.login_id),
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
      name_kana: d.name_kana ?? null,
      login_id: d.login_id,
      employment_type: d.employment_type,
      position: d.position ?? null,
      status: "active",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await admin.from("staff_roles").insert({
    company_id: actor.companyId,
    staff_id: staff.id,
    role_id: d.role_id,
    scope_type: "company",
  });
  await logAudit(actor, "staff.create", staff.id, null, { name: d.name, login_id: d.login_id });
  revalidatePath("/accounts");
  return {};
}
