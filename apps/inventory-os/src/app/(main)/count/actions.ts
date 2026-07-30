"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInventoryActor, requireManager } from "@/lib/auth";
import {
  openCountSession,
  saveCount,
  carryOverUnfilled,
  closeCountSession,
  getSession,
  listStock,
} from "@/lib/inventory";

export async function startCount(formData: FormData) {
  const actor = await requireInventoryActor();
  const storeId = (formData.get("storeId") as string) || null;
  const countedOn = (formData.get("countedOn") as string) || undefined;
  const r = await openCountSession(actor, storeId, countedOn);
  // 失敗（例: その基準日は確定済み）はクエリで戻す。フォームのactionは値を返せないため
  if ("error" in r) redirect(`/count?error=${encodeURIComponent(r.error)}`);
  redirect(`/count/${r.id}`);
}

/**
 * カウント1件の保存。iPadでの入力ごとに呼ばれるため、
 * 失敗しても画面は壊さず「保存できませんでした」だけ返す（数え直しの手戻りを最小にする）。
 */
export async function saveOne(sessionId: string, itemId: string, qty: number): Promise<{ error?: string }> {
  const actor = await requireInventoryActor();
  const session = await getSession(actor.companyId, sessionId);
  if (!session) return { error: "棚卸が見つかりません" };
  if (session.status === "closed") return { error: "この棚卸は確定済みです" };
  return saveCount(actor, sessionId, itemId, qty);
}

/** 未入力の品番を前回の数量で一括で埋める（「変わっていないものは触らない」運用の要） */
export async function fillUnchanged(formData: FormData) {
  const actor = await requireInventoryActor();
  const sessionId = String(formData.get("sessionId"));
  const session = await getSession(actor.companyId, sessionId);
  if (!session || session.status === "closed") return;
  const stock = await listStock(actor.companyId, { storeId: session.store_id });
  await carryOverUnfilled(
    actor,
    session,
    stock.map((s) => s.item_id)
  );
  revalidatePath(`/count/${sessionId}`);
}

/** 棚卸の確定。差異はDB関数がinv_movementsにadjustとして起票する */
export async function closeCount(formData: FormData) {
  const actor = await requireManager();
  const sessionId = String(formData.get("sessionId"));
  await closeCountSession(actor, sessionId);
  revalidatePath(`/count/${sessionId}`);
  revalidatePath("/");
}
