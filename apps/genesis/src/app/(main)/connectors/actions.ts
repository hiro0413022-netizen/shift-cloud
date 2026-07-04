"use server";

import { revalidatePath } from "next/cache";
import { randomBytes, createHash } from "crypto";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit, logEvent } from "@/lib/kernel";

/**
 * Webhookトークン発行（DECISIONS #12/#18と同方式: sha256ハッシュのみ保存、平文は発行時1回だけ表示）
 */
export async function issueWebhookToken(
  _prev: { token?: string; connector?: string; error?: string },
  formData: FormData
): Promise<{ token?: string; connector?: string; error?: string }> {
  const actor = await requireGenesisActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "connector未指定" };

  const admin = createAdmin();
  const { data: connector } = await admin
    .from("connectors")
    .select("id, code, name")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .single();
  if (!connector) return { error: "connectorが見つかりません" };

  const token = randomBytes(24).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");

  await admin
    .from("connectors")
    .update({ webhook_token_hash: hash, status: "configured" })
    .eq("id", id);

  await logAudit(actor, "connector.issue_token", "connectors", id);
  await logEvent(actor.companyId, {
    event_type: "connector.configured",
    title: `コネクタ設定: ${connector.name} のWebhookトークン発行`,
    source: "manual",
    source_type: "human",
  });
  revalidatePath("/connectors");
  return { token, connector: connector.code };
}
