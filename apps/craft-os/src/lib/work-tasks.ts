import "server-only";
import { createAdmin } from "@yozan/core/supabase/admin";
import type { Actor } from "@/lib/auth";
import type { FullQuote } from "@/lib/craft";
import { planWork, mdw, type WorkPlanStep } from "@/lib/work-schedule";
import { todayJst } from "@/lib/work-status";

export type AddTasksResult = { ok: boolean; message?: string; added: string[]; skipped: string[] };

/** 段取りの計算（画面の下見と、追加の両方で同じものを使う） */
export function workPlanOf(full: FullQuote): WorkPlanStep[] {
  const w = full.work;
  return planWork({ orderYmd: w?.ordered_on ?? todayJst(), dueYmd: w?.due_date ?? null });
}

/**
 * 【やることリストに追加】: 段取りを店舗の「やること」（Shift Cloud の sp_tasks・店舗共通）に入れる。
 * 自動では入れない（ユーザー判断 2026-09-19: ボタンを押したら追加）。
 * ・もう終わっている段（発注日・到着日などが入っている）は入れない
 * ・同じ注文書の同じ段は2回入らない（ref_key の一意索引。押し直しても安全）
 */
export async function addWorkTasks(actor: Actor, full: FullQuote): Promise<AddTasksResult> {
  const w = full.work;
  if (!w) return { ok: false, message: "注文書がまだありません（先に【ご注文いただいた】）", added: [], skipped: [] };
  const storeId = full.quote.store_id ?? actor.primaryStoreId;
  if (!storeId) return { ok: false, message: "店舗が決まっていないため、やることに入れられません", added: [], skipped: [] };

  const done: Record<WorkPlanStep["key"], boolean> = {
    order: Boolean(w.ordered_on),
    arrive: Boolean(w.arrived_on),
    assemble: Boolean(w.assembled_on),
    contact: Boolean(w.delivered_on),
  };
  const shafts = full.items.filter((i) => i.line_kind === "product" && i.item_category === "シャフト");
  const what = shafts.length
    ? `${shafts[0].product_name}${shafts[0].spec ? ` ${shafts[0].spec}` : ""}${shafts.length > 1 ? ` ほか${shafts.length - 1}本` : ""}`
    : "";
  const who = `${full.quote.customer_name} 様`;

  const admin = createAdmin();
  const added: string[] = [];
  const skipped: string[] = [];
  for (const s of workPlanOf(full)) {
    if (done[s.key]) {
      skipped.push(`${s.label}（済み）`);
      continue;
    }
    const refKey = `craft:wo:${w.id}:${s.key}`;
    const { error } = await admin.from("sp_tasks").insert({
      company_id: actor.companyId,
      store_id: storeId,
      staff_id: null, // 店舗共通（店の誰かがやる）
      date: s.date,
      title: `【工房】${s.label} ${w.order_no} ${who}`,
      note: [what, s.note, `Craft OS 伝票 ${full.quote.quote_no}`].filter(Boolean).join("／"),
      status: "open",
      source: "craft",
      ref_key: refKey,
      created_by: actor.staffId,
    });
    if (error) {
      if (error.code === "23505") skipped.push(`${s.label}（もう入っています）`);
      else return { ok: false, message: error.message, added, skipped };
    } else {
      added.push(`${mdw(s.date)} ${s.label}`);
    }
  }
  return { ok: true, added, skipped };
}
