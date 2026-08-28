"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/kernel";

/** 開発依頼のステータスを人が動かす（却下・差し戻し）。着手/完了はCowork側のClaudeが書く */
export async function setDevRequestStatus(formData: FormData) {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["queued", "rejected", "done"].includes(status)) return;

  const admin = createAdmin();
  const patch: Record<string, unknown> = { status };
  if (status === "done") patch.done_at = new Date().toISOString();
  if (status === "queued") {
    patch.picked_at = null;
    patch.done_at = null;
  }
  await admin.from("gn_dev_requests").update(patch).eq("id", id).eq("company_id", actor.companyId);
  await logAudit(actor, "dev_request.status", "gn_dev_requests", id, null, { status });
  revalidatePath("/dev-requests");
}
