"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSurveyActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/kernel";

export type ActionResult = { ok?: boolean; error?: string; id?: string };

const optionSchema = z.object({ value: z.string().min(1), label: z.string().min(1) });
const questionSchema = z.object({
  id: z.string().uuid().optional(),
  section: z.string().optional().default(""),
  code: z.string().min(1).max(20),
  type: z.enum(["single", "multi", "text", "textarea", "ranking", "scale"]),
  title: z.string().min(1),
  help_text: z.string().optional().default(""),
  required: z.boolean().optional().default(false),
  options: z.array(optionSchema).optional().default([]),
  config: z
    .object({
      allow_other: z.boolean().optional(),
      is_ranking_source: z.boolean().optional(),
      source_code: z.string().optional(),
    })
    .optional()
    .default({}),
});

/** 対象アンケートがactorの会社のものか検証してcompany_idを返す */
async function assertSurvey(admin: ReturnType<typeof createAdmin>, surveyId: string, companyId: string) {
  const { data } = await admin
    .from("svy_surveys")
    .select("id, company_id")
    .eq("id", surveyId)
    .is("deleted_at", null)
    .maybeSingle();
  const s = data as unknown as { id: string; company_id: string } | null;
  if (!s || s.company_id !== companyId) return null;
  return s;
}

// ============================================================
// アンケートメタ更新
// ============================================================
const surveyMetaSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(""),
  purpose: z.string().optional().default(""),
  slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, "slugは英小文字・数字・ハイフンのみ"),
  status: z.enum(["draft", "open", "closed"]),
  is_anonymous: z.boolean(),
  intro_text: z.string().optional().default(""),
  thanks_text: z.string().optional().default(""),
  est_minutes: z.number().int().min(0).max(120).nullable().optional(),
});

export async function updateSurvey(surveyId: string, input: unknown): Promise<ActionResult> {
  const actor = await requireSurveyActor();
  const admin = createAdmin();
  const s = await assertSurvey(admin, surveyId, actor.companyId);
  if (!s) return { error: "対象のアンケートが見つかりません。" };

  let m: z.infer<typeof surveyMetaSchema>;
  try {
    m = surveyMetaSchema.parse(input);
  } catch (e) {
    return { error: e instanceof z.ZodError ? e.issues[0].message : "入力が不正です。" };
  }

  const { error } = await admin
    .from("svy_surveys")
    .update({
      title: m.title,
      description: m.description || null,
      purpose: m.purpose || null,
      slug: m.slug,
      status: m.status,
      is_anonymous: m.is_anonymous,
      intro_text: m.intro_text || null,
      thanks_text: m.thanks_text || null,
      est_minutes: m.est_minutes ?? null,
    })
    .eq("id", surveyId);
  if (error) {
    if (error.code === "23505") return { error: "そのslugは既に使われています。" };
    return { error: "保存に失敗しました。" };
  }
  await logAudit(actor, "survey.update", "svy_surveys", surveyId, null, { title: m.title, status: m.status });
  revalidatePath(`/${surveyId}/edit`);
  return { ok: true };
}

// ============================================================
// 設問の追加/更新（upsert）
// ============================================================
export async function saveQuestion(surveyId: string, input: unknown): Promise<ActionResult> {
  const actor = await requireSurveyActor();
  const admin = createAdmin();
  const s = await assertSurvey(admin, surveyId, actor.companyId);
  if (!s) return { error: "対象のアンケートが見つかりません。" };

  let q: z.infer<typeof questionSchema>;
  try {
    q = questionSchema.parse(input);
  } catch (e) {
    return { error: e instanceof z.ZodError ? e.issues[0].message : "入力が不正です。" };
  }

  // 選択肢が必要な型で空はNG
  if (["single", "multi", "scale", "ranking"].includes(q.type) && q.options.length === 0) {
    return { error: "この設問タイプは選択肢を1つ以上設定してください。" };
  }

  // codeの重複チェック（自分以外）
  const { data: existing } = await admin
    .from("svy_questions")
    .select("id, code")
    .eq("survey_id", surveyId)
    .is("deleted_at", null);
  const rows = (existing ?? []) as unknown as Array<{ id: string; code: string }>;
  if (rows.some((r) => r.code === q.code && r.id !== q.id)) {
    return { error: `設問コード「${q.code}」は既に使われています。` };
  }

  // ranking は pool を config に同梱
  const config: Record<string, unknown> = { ...q.config };
  if (q.type === "ranking") config.pool = q.options;
  if (q.type !== "ranking") delete config.source_code;
  if (q.type !== "multi") { delete config.allow_other; delete config.is_ranking_source; }

  if (q.id) {
    const { error } = await admin
      .from("svy_questions")
      .update({
        section: q.section || null,
        code: q.code,
        type: q.type,
        title: q.title,
        help_text: q.help_text || null,
        required: q.required,
        options: q.options,
        config,
      })
      .eq("id", q.id)
      .eq("survey_id", surveyId);
    if (error) return { error: "保存に失敗しました。" };
    await logAudit(actor, "question.update", "svy_questions", q.id, null, { code: q.code });
    revalidatePath(`/${surveyId}/edit`);
    return { ok: true, id: q.id };
  }

  // 新規: positionは末尾
  const maxPos = rows.length
    ? Math.max(
        ...((await admin.from("svy_questions").select("position").eq("survey_id", surveyId).is("deleted_at", null)).data ?? [])
          .map((r) => (r as { position: number }).position)
      )
    : 0;
  const { data: ins, error } = await admin
    .from("svy_questions")
    .insert({
      company_id: actor.companyId,
      survey_id: surveyId,
      section: q.section || null,
      position: maxPos + 1,
      code: q.code,
      type: q.type,
      title: q.title,
      help_text: q.help_text || null,
      required: q.required,
      options: q.options,
      config,
    })
    .select("id")
    .single();
  if (error || !ins) return { error: "追加に失敗しました。" };
  await logAudit(actor, "question.create", "svy_questions", ins.id, null, { code: q.code });
  revalidatePath(`/${surveyId}/edit`);
  return { ok: true, id: ins.id };
}

// ============================================================
// 設問の削除（論理削除）
// ============================================================
export async function deleteQuestion(surveyId: string, questionId: string): Promise<ActionResult> {
  const actor = await requireSurveyActor();
  const admin = createAdmin();
  const s = await assertSurvey(admin, surveyId, actor.companyId);
  if (!s) return { error: "対象のアンケートが見つかりません。" };

  const { error } = await admin
    .from("svy_questions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", questionId)
    .eq("survey_id", surveyId);
  if (error) return { error: "削除に失敗しました。" };
  await logAudit(actor, "question.delete", "svy_questions", questionId, null, null);
  revalidatePath(`/${surveyId}/edit`);
  return { ok: true };
}

// ============================================================
// 並び替え（上下入れ替え）
// ============================================================
export async function moveQuestion(surveyId: string, questionId: string, dir: "up" | "down"): Promise<ActionResult> {
  const actor = await requireSurveyActor();
  const admin = createAdmin();
  const s = await assertSurvey(admin, surveyId, actor.companyId);
  if (!s) return { error: "対象のアンケートが見つかりません。" };

  const { data } = await admin
    .from("svy_questions")
    .select("id, position")
    .eq("survey_id", surveyId)
    .is("deleted_at", null)
    .order("position", { ascending: true });
  const list = (data ?? []) as unknown as Array<{ id: string; position: number }>;
  const idx = list.findIndex((r) => r.id === questionId);
  if (idx < 0) return { error: "設問が見つかりません。" };
  const swapWith = dir === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= list.length) return { ok: true };

  const a = list[idx];
  const b = list[swapWith];
  // 一時退避して衝突回避（positionにunique制約はないが安全側）
  await admin.from("svy_questions").update({ position: -1 }).eq("id", a.id);
  await admin.from("svy_questions").update({ position: a.position }).eq("id", b.id);
  await admin.from("svy_questions").update({ position: b.position }).eq("id", a.id);
  revalidatePath(`/${surveyId}/edit`);
  return { ok: true };
}

// ============================================================
// 新規アンケート作成 → 編集画面へ
// ============================================================
export async function createSurvey(title: string): Promise<ActionResult> {
  const actor = await requireSurveyActor();
  const admin = createAdmin();
  const t = title.trim() || "新しいアンケート";
  const slug = "survey-" + Math.random().toString(36).slice(2, 8);
  const { data, error } = await admin
    .from("svy_surveys")
    .insert({
      company_id: actor.companyId,
      slug,
      title: t,
      status: "draft",
      is_anonymous: true,
      intro_text: "ご回答をお願いします。",
      thanks_text: "ご協力ありがとうございました。",
    })
    .select("id")
    .single();
  if (error || !data) return { error: "作成に失敗しました。" };
  await logAudit(actor, "survey.create", "svy_surveys", data.id, null, { title: t });
  revalidatePath(`/`);
  return { ok: true, id: data.id };
}
