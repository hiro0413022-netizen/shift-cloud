"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActor, authEmailFor, isOwner, scopedStoreIds, type Actor } from "@/lib/auth";
import { todayJST } from "@/lib/util";
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

/**
 * 対象スタッフを編集してよいか（#134・#128 店舗またぎ廃止）。
 * 画面に出していなくても id を差し替えれば他店スタッフのパスワードまで変えられたので、サーバーで止める。
 * 無所属（役員・本部）スタッフを触れるのはオーナーだけ。
 */
async function canManageStaff(actor: Actor, staffId: string): Promise<boolean> {
  if (isOwner(actor)) return true;
  const admin = createAdmin();
  const allowed = await scopedStoreIds(actor);
  const { data } = await admin
    .from("staff_store_assignments")
    .select("store_id")
    .eq("staff_id", staffId)
    .is("deleted_at", null);
  return (data ?? []).some((a) => allowed.includes(a.store_id));
}

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
    // ログインIDが入っていればそれを認証IDに（lib/auth authEmailFor が正典・ログイン画面と同じルール）
    const authEmail = authEmailFor(d.email, d.login_id)!;
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
    // 他店スタッフの編集（氏名・ログインID・パスワード変更）を止める（#134）
    if (!(await canManageStaff(actor, staffId))) return { error: "このスタッフを編集する権限がありません" };
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

    // 認証ID（Auth側のemail）を staff の設定に合わせて同期する。
    // これが無いと「管理画面でログインIDを変えたのに、そのIDでは入れない」事故になる（2026-07-27）
    if (before?.auth_user_id) {
      const wanted = authEmailFor(d.email, d.login_id);
      const { data: authNow } = await admin.auth.admin.getUserById(before.auth_user_id);
      const current = authNow?.user?.email?.toLowerCase() ?? null;
      if (wanted && current !== wanted) {
        const { error: mailErr } = await admin.auth.admin.updateUserById(before.auth_user_id, {
          email: wanted,
          email_confirm: true, // 内部IDなので確認メールは送らない
        });
        if (mailErr) return { error: `ログインIDの変更に失敗しました: ${mailErr.message}` };
      }
      if (d.password && d.password.length >= 8) {
        const { error: pwErr } = await admin.auth.admin.updateUserById(before.auth_user_id, { password: d.password });
        if (pwErr) return { error: `パスワードの変更に失敗しました: ${pwErr.message}` };
      }
    }
    await logAudit(actor, "staff.update", "staff", staffId, before, d);
  }

  // 店舗割当を置き換え（店舗なし=役員・本部は割当ゼロでOK）
  //
  // 店舗スコープ（#134・#128 店舗またぎ廃止）:
  //   ・store_ids はフォームから来る＝改竄できるので、許可店舗（オーナー=全店/それ以外=配属店舗）だけを通す。
  //   ・delete も許可店舗に限定する。以前は staff_id だけで全配属を消していたため、
  //     姫路の店長が兼務スタッフを編集すると宝塚の配属まで消えていた。
  const allowedStoreIds = await scopedStoreIds(actor);
  if (d.store_ids.some((sid) => !allowedStoreIds.includes(sid))) {
    return { error: "権限のない店舗が含まれています" };
  }
  await admin.from("staff_store_assignments").delete().eq("staff_id", staffId).in("store_id", allowedStoreIds);
  if (d.store_ids.length > 0) {
    const primary = d.primary_store_id && d.store_ids.includes(d.primary_store_id) ? d.primary_store_id : d.store_ids[0];
    // 残した他店の配属に主店舗フラグがあると2つになるので降ろす（主店舗は1つ）
    await admin.from("staff_store_assignments")
      .update({ is_primary: false })
      .eq("staff_id", staffId)
      .not("store_id", "in", `(${allowedStoreIds.join(",")})`);
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

  // 時給: 現在値と異なれば履歴追加。
  // ・「最新」の判定は effective_from だけでなく created_at でもタイブレークする
  //   （同じ日に2回変えると effective_from が並び、どちらが最新か決まらず
  //     「変更しても反映されない」事故になっていた / 2026-07-27）
  // ・同じ日の変更は履歴を増やさず、その日の行を上書きする
  // ・日付はJST（lib/util todayJST）。UTCだと朝9時前が前日になる
  if (d.hourly_wage !== undefined) {
    const today = todayJST();
    const { data: rows } = await admin
      .from("staff_wages")
      .select("id, hourly_wage, commute_allowance, effective_from, created_at")
      .eq("staff_id", staffId)
      .is("deleted_at", null)
      .order("effective_from", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);
    const cur = rows?.[0] ?? null;
    if (!cur || cur.hourly_wage !== d.hourly_wage || cur.commute_allowance !== d.commute_allowance) {
      const sameDay = cur && cur.effective_from === today ? cur : null;
      const { error: wageErr } = sameDay
        ? await admin
            .from("staff_wages")
            .update({ hourly_wage: d.hourly_wage, commute_allowance: d.commute_allowance })
            .eq("id", sameDay.id)
        : await admin.from("staff_wages").insert({
            company_id: actor.companyId,
            staff_id: staffId,
            hourly_wage: d.hourly_wage,
            commute_allowance: d.commute_allowance,
            effective_from: today,
          });
      if (wageErr) return { error: `時給の保存に失敗しました: ${wageErr.message}` };
      await logAudit(actor, "staff.wage_change", "staff_wages", staffId, cur, {
        hourly_wage: d.hourly_wage,
        commute_allowance: d.commute_allowance,
        effective_from: today,
        mode: sameDay ? "update" : "insert",
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
  if (!(await canManageStaff(actor, id))) return; // 他店スタッフは停止/再開できない（#134）
  const { data: before } = await admin.from("staff").select("status").eq("id", id).single();
  const next = before?.status === "active" ? "inactive" : "active";
  await admin.from("staff").update({ status: next }).eq("id", id).eq("company_id", actor.companyId);
  await logAudit(actor, `staff.${next}`, "staff", id, before, { status: next });
  revalidatePath("/admin/staff");
}
