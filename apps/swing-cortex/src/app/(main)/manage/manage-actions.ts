"use server";

import { revalidatePath } from "next/cache";
import { requireCoachActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * 症状項目マスタのCRUD（DB=正典。ユーザーが足す/直す分は source='manual'）。
 * すべて company_id スコープ。/manage の編集UIから呼ぶ。
 */

function parseTags(csv: string): string[] {
  return (csv ?? "")
    .split(/[\/、,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 症状を新規作成（末尾に並ぶよう sort_order を最大+10） */
export async function createSymptom(input: { category: string; name: string; tags: string }): Promise<{ id: string } | { error: string }> {
  const actor = await requireCoachActor();
  const name = input.name.trim();
  const category = input.category.trim();
  if (!name || !category) return { error: "分類と症状名は必須です" };
  const admin = createAdmin();
  const { data: maxRow } = await admin
    .from("sc_symptoms")
    .select("sort_order")
    .eq("company_id", actor.companyId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 10;
  const { data, error } = await admin
    .from("sc_symptoms")
    .insert({
      company_id: actor.companyId,
      category,
      name,
      tags: parseTags(input.tags),
      sort_order: nextOrder,
      active: true,
      source: "manual",
    })
    .select("id")
    .single();
  if (error || !data) return { error: "作成に失敗しました" };
  revalidatePath("/manage");
  revalidatePath("/");
  return { id: (data as { id: string }).id };
}

/** 症状を更新 */
export async function updateSymptom(input: {
  id: string;
  category: string;
  name: string;
  tags: string;
  active: boolean;
}): Promise<{ ok: boolean }> {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  await admin
    .from("sc_symptoms")
    .update({
      category: input.category.trim(),
      name: input.name.trim(),
      tags: parseTags(input.tags),
      active: input.active,
    })
    .eq("company_id", actor.companyId)
    .eq("id", input.id);
  revalidatePath("/manage");
  revalidatePath("/");
  return { ok: true };
}

/** 症状を削除（確認項目・知識はカスケード削除） */
export async function deleteSymptom(id: string): Promise<{ ok: boolean }> {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  await admin.from("sc_symptoms").delete().eq("company_id", actor.companyId).eq("id", id);
  revalidatePath("/manage");
  revalidatePath("/");
  return { ok: true };
}

/** 確認項目（チェック＋知識の1組）を保存。id無し=新規、有り=更新 */
export async function saveCheckpoint(input: {
  id?: string | null;
  knowledgeId?: string | null;
  symptomId: string;
  priority: number;
  title: string;
  cause: string;
  fix: string;
  drill: string;
  client: string;
}): Promise<{ ok: boolean } | { error: string }> {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  const title = input.title.trim();
  if (!title) return { error: "チェック項目名は必須です" };

  if (input.id) {
    await admin
      .from("sc_checkpoints")
      .update({ priority: input.priority, title })
      .eq("company_id", actor.companyId)
      .eq("id", input.id);
    if (input.knowledgeId) {
      await admin
        .from("sc_knowledge")
        .update({
          cause: input.cause,
          fix: input.fix,
          drill: input.drill,
          client_explanation: input.client,
        })
        .eq("company_id", actor.companyId)
        .eq("id", input.knowledgeId);
    } else {
      await admin.from("sc_knowledge").insert({
        company_id: actor.companyId,
        checkpoint_id: input.id,
        cause: input.cause,
        fix: input.fix,
        drill: input.drill,
        client_explanation: input.client,
        source: "manual",
      });
    }
  } else {
    const { data: cp } = await admin
      .from("sc_checkpoints")
      .insert({ company_id: actor.companyId, symptom_id: input.symptomId, priority: input.priority, title })
      .select("id")
      .single();
    const cpId = (cp as { id: string } | null)?.id;
    if (cpId) {
      await admin.from("sc_knowledge").insert({
        company_id: actor.companyId,
        checkpoint_id: cpId,
        cause: input.cause,
        fix: input.fix,
        drill: input.drill,
        client_explanation: input.client,
        source: "manual",
      });
    }
  }
  revalidatePath("/manage");
  revalidatePath("/");
  return { ok: true };
}

/** 確認項目を削除（知識はカスケード削除） */
export async function deleteCheckpoint(id: string): Promise<{ ok: boolean }> {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  await admin.from("sc_checkpoints").delete().eq("company_id", actor.companyId).eq("id", id);
  revalidatePath("/manage");
  revalidatePath("/");
  return { ok: true };
}
