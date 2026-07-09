"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { db } from "@/lib/supabase";
import { createSession, clearSession, getSession } from "@/lib/session";
import { setActiveProjectCookie } from "@/lib/ctx";

// --- 認証 ---
export async function loginAction(prevState, formData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  if (!email || !password) return { error: "メールとパスワードを入力してください" };

  const supa = db();
  const { data: user } = await supa
    .from("app_users")
    .select("*")
    .ilike("email", email)
    .eq("is_active", true)
    .maybeSingle();

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return { error: "メールまたはパスワードが違います" };
  }

  const { data: mem } = await supa
    .from("memberships")
    .select("role, tenant_id, tenants(name)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!mem) return { error: "所属会社が設定されていません" };

  await createSession({
    uid: user.id,
    name: user.name || email,
    email: user.email,
    tenantId: mem.tenant_id,
    tenantName: mem.tenants?.name || "",
    role: mem.role,
  });
  redirect("/");
}

export async function logoutAction() {
  clearSession();
  redirect("/login");
}

export async function switchProjectAction(formData) {
  const pid = String(formData.get("projectId") || "");
  if (pid) setActiveProjectCookie(pid);
  revalidatePath("/", "layout");
}

// --- TODO ---
export async function toggleTaskAction(formData) {
  const id = String(formData.get("id"));
  const done = String(formData.get("done")) === "true";
  const supa = db();
  await supa.from("tasks").update({ is_done: done, done_at: done ? new Date().toISOString() : null }).eq("id", id);
  revalidatePath("/");
}

export async function addTaskAction(formData) {
  const session = await getSession();
  const supa = db();
  const leadId = formData.get("leadId") ? String(formData.get("leadId")) : null;
  await supa.from("tasks").insert({
    tenant_id: session.tenantId,
    project_id: formData.get("projectId") ? String(formData.get("projectId")) : null,
    lead_id: leadId,
    owner_id: session.uid,
    title: String(formData.get("title") || "やること"),
    due_date: formData.get("due_date") ? String(formData.get("due_date")) : null,
  });
  if (leadId) revalidatePath(`/leads/${leadId}`);
  revalidatePath("/");
}

// --- 活動履歴 ---
export async function addActivityAction(formData) {
  const session = await getSession();
  const supa = db();
  const leadId = String(formData.get("leadId"));
  await supa.from("activities").insert({
    lead_id: leadId,
    type: String(formData.get("type") || "note"),
    body: String(formData.get("body") || ""),
    user_id: session.uid,
  });
  // 次の約束(TODO)も同時に作れる
  const nextTitle = String(formData.get("next_title") || "").trim();
  if (nextTitle) {
    await supa.from("tasks").insert({
      tenant_id: session.tenantId,
      project_id: formData.get("projectId") ? String(formData.get("projectId")) : null,
      lead_id: leadId,
      owner_id: session.uid,
      title: nextTitle,
      due_date: formData.get("next_due") ? String(formData.get("next_due")) : null,
    });
  }
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/");
}

// --- 段階変更 ---
export async function moveStageAction(formData) {
  const supa = db();
  const leadId = String(formData.get("leadId"));
  await supa.from("leads").update({ stage_id: String(formData.get("stageId")), updated_at: new Date().toISOString() }).eq("id", leadId);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/board");
  revalidatePath("/list");
  revalidatePath("/");
}

// --- 問い合わせ受付（相手＋案件を新規作成）---
export async function createInquiryAction(prevState, formData) {
  const session = await getSession();
  const supa = db();
  const projectId = String(formData.get("projectId"));
  const companyName = String(formData.get("company") || "").trim();
  if (!companyName) return { error: "会社/相手の名前は必須です" };

  const { data: company } = await supa.from("companies").insert({
    tenant_id: session.tenantId,
    project_id: projectId,
    name: companyName,
    rep_name: String(formData.get("contact") || "") || null,
  }).select().single();

  const contactName = String(formData.get("contact") || "").trim();
  if (contactName || formData.get("phone") || formData.get("email")) {
    await supa.from("contacts").insert({
      company_id: company.id,
      name: contactName || null,
      phone: String(formData.get("phone") || "") || null,
      email: String(formData.get("email") || "") || null,
    });
  }

  // 最初の段階を取得
  const { data: stage } = await supa.from("pipeline_stages")
    .select("id").eq("project_id", projectId).order("sort").limit(1).maybeSingle();

  const { data: lead } = await supa.from("leads").insert({
    tenant_id: session.tenantId,
    project_id: projectId,
    company_id: company.id,
    title: companyName,
    stage_id: stage?.id || null,
    channel_id: formData.get("channelId") ? String(formData.get("channelId")) : null,
    status_note: String(formData.get("note") || "") || null,
    inquiry_date: formData.get("inquiry_date") ? String(formData.get("inquiry_date")) : new Date().toISOString().slice(0, 10),
    owner_id: session.uid,
  }).select().single();

  redirect(`/leads/${lead.id}`);
}

// --- 設定（ノーコード）---
export async function addStageAction(formData) {
  const supa = db();
  const projectId = String(formData.get("projectId"));
  const { data: max } = await supa.from("pipeline_stages").select("sort").eq("project_id", projectId).order("sort", { ascending: false }).limit(1).maybeSingle();
  await supa.from("pipeline_stages").insert({
    project_id: projectId,
    name: String(formData.get("name") || "新しい段階"),
    sort: (max?.sort ?? 0) + 1,
    is_won: String(formData.get("is_won")) === "on",
    is_lost: String(formData.get("is_lost")) === "on",
  });
  revalidatePath("/settings");
}

export async function addChannelAction(formData) {
  const supa = db();
  const projectId = String(formData.get("projectId"));
  await supa.from("channels").insert({
    project_id: projectId,
    name: String(formData.get("name") || "新しい経路"),
    category: String(formData.get("category") || "inbound"),
  });
  revalidatePath("/settings");
}

export async function addFieldAction(formData) {
  const supa = db();
  const projectId = String(formData.get("projectId"));
  await supa.from("custom_field_defs").insert({
    project_id: projectId,
    entity: "lead",
    key: String(formData.get("key") || "field").replace(/\s+/g, "_"),
    label: String(formData.get("label") || "項目"),
    type: String(formData.get("type") || "text"),
  });
  revalidatePath("/settings");
}

export async function addProjectAction(formData) {
  const session = await getSession();
  const supa = db();
  const { data: proj } = await supa.from("projects").insert({
    tenant_id: session.tenantId,
    name: String(formData.get("name") || "新しい商品"),
    code: String(formData.get("code") || "") || null,
  }).select().single();
  // 既定の段階を用意
  const stages = ["問い合わせ", "商談", "モニター", "導入"];
  await supa.from("pipeline_stages").insert(
    stages.map((n, i) => ({ project_id: proj.id, name: n, sort: i + 1, is_won: n === "導入" }))
  );
  revalidatePath("/settings");
}

export async function toggleActiveAction(formData) {
  const supa = db();
  const table = String(formData.get("table"));
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  if (["channels", "projects"].includes(table)) {
    await supa.from(table).update({ is_active: active }).eq("id", id);
  }
  revalidatePath("/settings");
}
