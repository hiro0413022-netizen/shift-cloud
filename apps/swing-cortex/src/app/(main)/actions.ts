"use server";

import { requireCoachActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * 診断ログを保存（LINE送信・コピー時に記録）。
 * データフライホイールの一部：どの症状がよく診られ、LINE送信されたかを蓄積。
 */
export async function logDiagnosis(input: {
  symptomId: string;
  symptomName: string;
  studentRef?: string | null;
  inputText?: string | null;
  sentLine: boolean;
}): Promise<{ ok: boolean }> {
  const actor = await requireCoachActor();
  const admin = createAdmin();
  await admin.from("sc_diagnoses").insert({
    company_id: actor.companyId,
    coach_staff_id: actor.staffId,
    symptom_id: input.symptomId,
    student_ref: input.studentRef ?? null,
    input_text: input.inputText ?? null,
    sent_line: input.sentLine,
    result_json: { symptom: input.symptomName },
  });
  return { ok: true };
}
