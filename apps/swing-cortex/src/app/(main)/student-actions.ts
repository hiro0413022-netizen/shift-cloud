"use server";

import { revalidatePath } from "next/cache";
import { requireCoachActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";

/** 生徒を新規登録 */
export async function createStudent(input: { name: string; nameKana?: string; memberCode?: string }): Promise<{ id: string } | { error: string }> {
  const actor = await requireCoachActor();
  const name = (input.name ?? "").trim();
  if (!name) return { error: "氏名を入力してください" };
  const admin = createAdmin();
  const { data, error } = await admin
    .from("sc_students")
    .insert({
      company_id: actor.companyId,
      name,
      name_kana: input.nameKana?.trim() || null,
      member_code: input.memberCode?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "登録に失敗しました" };
  revalidatePath("/");
  revalidatePath("/students");
  return { id: (data as { id: string }).id };
}

/** 生徒カルテ（sc_notes）にコメントを保存 */
export async function saveNote(input: {
  studentId: string;
  symptomId?: string | null;
  symptomName?: string | null;
  coachMemo?: string | null;
  structured: string;
  natural: string;
}): Promise<{ ok: boolean }> {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  await admin.from("sc_notes").insert({
    company_id: actor.companyId,
    student_id: input.studentId,
    symptom_id: input.symptomId ?? null,
    symptom_name: input.symptomName ?? null,
    coach_memo: input.coachMemo ?? null,
    structured: input.structured,
    natural_text: input.natural,
    coach_staff_id: actor.staffId,
  });
  revalidatePath(`/students/${input.studentId}`);
  return { ok: true };
}
