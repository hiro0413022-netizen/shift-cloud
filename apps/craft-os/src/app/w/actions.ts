"use server";

import { revalidatePath } from "next/cache";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { getQuote } from "@/lib/craft";
import { postSales } from "@/lib/sales";
import { todayJst, workStatusOf } from "@/lib/work-status";

const STEP_KEYS = ["ordered_on", "arrived_on", "assembled_on", "reve_sent_on", "delivered_on", "td_on", "paid_on"] as const;

/**
 * 工房ボードの【到着した】【組み上がった】【お渡しした】など。押した日（今日）を入れる。
 * もう入っている日付は上書きしない。お渡しが入ったら Money OS へ売上を計上（二重計上は関数側で防ぐ）。
 */
export async function markWorkStep(formData: FormData): Promise<void> {
  const quoteId = Number(formData.get("quote_id"));
  const key = String(formData.get("step") ?? "") as (typeof STEP_KEYS)[number];
  if (!STEP_KEYS.includes(key)) return;
  const actor = await requireActor();
  const full = await getQuote(actor, quoteId);
  if (!full?.work || full.work[key]) return;

  const next = { ...full.work, [key]: todayJst() };
  await createAdmin()
    .from("gw_work_orders")
    .update({ [key]: next[key], status: workStatusOf(next), updated_at: new Date().toISOString() })
    .eq("id", full.work.id)
    .eq("company_id", actor.companyId);
  if (key === "delivered_on") await postSales(actor, quoteId);

  revalidatePath("/w");
  revalidatePath(`/q/${quoteId}/work`);
  revalidatePath("/");
}
