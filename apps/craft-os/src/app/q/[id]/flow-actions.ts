"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { getQuote } from "@/lib/craft";
import { placeOrder as placeOrderCore, type PlaceOrderResult } from "@/lib/place-order";
import { postSales } from "@/lib/sales";
import { ensureWorkOrder } from "@/lib/work-order";
import { todayJst, workStatusOf } from "@/lib/work-status";
import { addWorkTasks, type AddTasksResult } from "@/lib/work-tasks";

/**
 * 伝票の上の「流れ」のボタン。
 *   見積を作る → お客様に見せる → ご注文（注文書を印刷）→ お支払い／発注（発注管理へ）→ 到着 → 組立 → お渡し
 * ⚠ "use server" ファイルなので、ここから export するのは async 関数だけ（同期関数を出すとビルドが落ちる）。
 */

async function mustQuote(id: number) {
  const actor = await requireActor();
  const full = await getQuote(actor, id);
  if (!full) throw new Error("伝票が見つかりません");
  return { actor, full };
}

function touch(id: number) {
  revalidatePath(`/q/${id}/quote`);
  revalidatePath(`/q/${id}/work`);
  revalidatePath("/");
}

/** お客様に御見積書を見せる: 提示済みにして、御見積書の印刷画面へ */
export async function presentQuote(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const { actor, full } = await mustQuote(id);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (!full.quote.quote_issued_at) patch.quote_issued_at = new Date().toISOString();
  if (["draft", "reviewed"].includes(full.quote.status)) patch.status = "presented";
  await createAdmin().from("gw_quotes").update(patch).eq("id", id).eq("company_id", actor.companyId);
  touch(id);
  redirect(`/print/quote/${id}`);
}

/** ご注文いただいた: 注文書をつくって、御注文書の印刷画面へ */
export async function acceptOrder(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const { actor, full } = await mustQuote(id);
  await ensureWorkOrder(actor, full);
  touch(id);
  // 御見積書の印刷画面から来たとき（then=work）は注文書の画面へ。流れのバーからは御注文書の印刷へ
  redirect(formData.get("then") === "work" ? `/q/${id}/work` : `/print/order/${id}`);
}

/** お支払い済み: 注文書の「お支払い」日に今日を入れる（取り消しは注文書タブで日付を消す） */
export async function markPaid(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const { actor, full } = await mustQuote(id);
  const admin = createAdmin();
  const workId = await ensureWorkOrder(actor, full);
  const { data: w } = await admin
    .from("gw_work_orders")
    .select("ordered_on, arrived_on, assembled_on, delivered_on, paid_on")
    .eq("id", workId)
    .maybeSingle();
  if (w && !w.paid_on) {
    const next = { ...w, paid_on: todayJst() };
    await admin
      .from("gw_work_orders")
      .update({ paid_on: next.paid_on, status: workStatusOf(next), updated_at: new Date().toISOString() })
      .eq("id", workId)
      .eq("company_id", actor.companyId);
    // お渡し済みのあとでお支払いが入った場合も、売上は1回だけ（二重計上は関数側で防ぐ）
    if (w.delivered_on) await postSales(actor, id);
  }
  touch(id);
}

/** 発注する: 発注管理の発注プールへ。結果（開く発注）を画面に返す */
export async function placeOrder(quoteId: number): Promise<PlaceOrderResult> {
  const actor = await requireActor();
  const r = await placeOrderCore(actor, quoteId);
  touch(quoteId);
  return r;
}

/** やることリストに追加（工房の段取りを Shift Cloud の店舗の「やること」へ）。押したときだけ入れる */
export async function addTasksForWork(quoteId: number): Promise<AddTasksResult> {
  const { actor, full } = await mustQuote(quoteId);
  const r = await addWorkTasks(actor, full);
  revalidatePath(`/q/${quoteId}/work`);
  revalidatePath("/w");
  return r;
}
