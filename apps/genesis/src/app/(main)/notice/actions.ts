"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { sendStaffNotice, type SendNoticeResult } from "@/lib/staff-notice";

/** スタッフへ連絡（記録＋公式LINE配信＋任意でやること / DECISIONS #59） */
export async function sendNotice(formData: FormData): Promise<SendNoticeResult> {
  const actor = await requireGenesisActor();
  const message = String(formData.get("message") ?? "");
  const groupId = String(formData.get("group_id") ?? "") || null;
  const asTask = formData.get("as_task") === "on";

  const res = await sendStaffNotice(actor, { message, groupId, asTask });
  if (res.ok) revalidatePath("/notice");
  return res;
}
