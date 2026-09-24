"use server";

import { revalidatePath } from "next/cache";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { getQuote } from "@/lib/craft";
import { postSales } from "@/lib/sales";
import { afterSave } from "@/lib/after-save";
import { ensureWorkOrder } from "@/lib/work-order";
import { placeOrder } from "@/lib/place-order";
import { parseDay, todayJst, workStatusOf } from "@/lib/work-status";

const admin = () => createAdmin();

function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function txt(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

async function mustQuote(id: number) {
  const actor = await requireActor();
  const full = await getQuote(actor, id);
  if (!full) throw new Error("伝票が見つかりません");
  return { actor, full };
}

/**
 * 注文書をつくる。見積のシャフト行1本につき、組立指示書の行を1つ用意する。
 * （紙では毎回いちから書いていた欄を、最初から埋まった状態で出す）
 */
export async function createWorkOrder(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const { actor, full } = await mustQuote(id);
  await ensureWorkOrder(actor, full);
  revalidatePath(`/q/${id}/work`);
  revalidatePath(`/q/${id}/quote`);
}

/** 進捗と REVE の情報。紙の注文書 最終行と同じ並び */
export async function saveWork(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const { actor, full } = await mustQuote(id);
  if (!full.work) return;

  const steps = ["ordered_on", "arrived_on", "assembled_on", "reve_sent_on", "delivered_on", "td_on", "paid_on"] as const;
  const patch: Record<string, unknown> = {
    due_date: txt(formData.get("due_date")),
    assembled_by_name: txt(formData.get("assembled_by_name")),
    reve_color: txt(formData.get("reve_color")),
    reve_serial: txt(formData.get("reve_serial")),
    note: txt(formData.get("work_note")),
    updated_at: new Date().toISOString(),
  };
  // 紙と同じ「9／18」でも、日付の入力（2026-09-18）でも受ける。欄が無いフォームから来たときは今の値を残す
  for (const s of steps) patch[s] = formData.has(s) ? parseDay(txt(formData.get(s))) : full.work[s];

  // 状態は進捗から決める（手で選ばせない＝画面と実態がずれない）
  patch.status = workStatusOf(patch as Record<string, string | null>);

  await admin().from("gw_work_orders").update(patch).eq("id", full.work.id).eq("company_id", actor.companyId);

  // 注文書の紙の上で直したお客様名・担当（#275・2026-09-24）。伝票側に持っているので別で保存する。
  // 欄が無いフォームや空欄で来たときは今の値を残す（お名前を空にできては困る）
  const keep = (key: string, current: string | null) => {
    if (!formData.has(key)) return current;
    const v = String(formData.get(key) ?? "").trim();
    return v === "" ? current : v;
  };
  const customerName = keep("customer_name", full.quote.customer_name);
  const staffName = keep("staff_name", full.quote.staff_name);
  if (customerName !== full.quote.customer_name || staffName !== full.quote.staff_name) {
    await admin()
      .from("gw_quotes")
      .update({ customer_name: customerName, staff_name: staffName, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", actor.companyId);
  }

  // お渡しが入ったら、その場で Money OS へ売上を計上する（二重計上は関数側で防ぐ）
  if (patch.delivered_on) await postSales(actor, id);

  revalidatePath(`/q/${id}/work`);
  revalidatePath(`/q/${id}/quote`);
  revalidatePath("/");
  afterSave(formData, id);
}

/**
 * 発注管理の「発注プール」へ下書きを作る。
 * 仕入先ごとに1件ずつ。あとは発注管理の画面からいつもどおり送るだけ。
 */
export async function createPurchaseDrafts(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const actor = await requireActor();
  const r = await placeOrder(actor, id);
  if (!r.ok && r.message) throw new Error(r.message);
  revalidatePath(`/q/${id}/work`);
}

/** 組立仕様。目標（範囲）と実測を、同じ画面で別の列として持つ */
export async function saveSpecs(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const { actor, full } = await mustQuote(id);
  if (!full.work) return;

  for (const s of full.specs) {
    await admin()
      .from("gw_work_order_specs")
      .update({
        priority: num(formData.get(`prio_${s.id}`)),
        head_name: txt(formData.get(`head_${s.id}`)),
        cpm_min: num(formData.get(`cpm_min_${s.id}`)),
        cpm_max: num(formData.get(`cpm_max_${s.id}`)),
        balance_min: txt(formData.get(`bal_min_${s.id}`)),
        balance_max: txt(formData.get(`bal_max_${s.id}`)),
        length_min: num(formData.get(`len_min_${s.id}`)),
        length_max: num(formData.get(`len_max_${s.id}`)),
        weight_min: num(formData.get(`wt_min_${s.id}`)),
        weight_max: num(formData.get(`wt_max_${s.id}`)),
        head_weight: num(formData.get(`hw_${s.id}`)),
        screw: txt(formData.get(`screw_${s.id}`)),
        grip_layers: txt(formData.get(`layers_${s.id}`)),
        grip_wrap: txt(formData.get(`wrap_${s.id}`)),
        sleeve_source: txt(formData.get(`sleeve_${s.id}`)),
        sleeve_position: txt(formData.get(`pos_${s.id}`)),
        spec_note: txt(formData.get(`note_${s.id}`)),
        // 組み上がりの実測は【組立データ】（saveAssemblyData）で入れる。ここでは触らない（#262）
        updated_at: new Date().toISOString(),
      })
      .eq("id", s.id)
      .eq("company_id", actor.companyId);
  }
  revalidatePath(`/q/${id}/work`);
  revalidatePath("/w");
  // 【保存して組立指示書を印刷】から来たら印刷画面へ（2026-09-24）。
  // これが無いと、指示書を打った本人は上の注文書側のボタンを押すしかなく、
  // そちらは saveWork なので打った内容が保存されないまま印刷されていた。
  afterSave(formData, id);
}

/** 指示書の行を足す（持ち込みクラブなど、見積の明細に無いもの） */
export async function addSpecLine(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const { actor, full } = await mustQuote(id);
  if (!full.work) return;
  const nextLine = Math.max(0, ...full.specs.map((s) => s.line_no)) + 1;
  await admin().from("gw_work_order_specs").insert({
    company_id: actor.companyId,
    work_order_id: full.work.id,
    line_no: nextLine,
    priority: nextLine,
  });
  revalidatePath(`/q/${id}/work`);
}

/** 指示書の行を1つ消す。IDは bind で渡す（ボタンの name は React に上書きされる → removeItem のコメント参照） */
export async function removeSpecLine(specId: number, formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  if (!specId) return;
  const { actor } = await mustQuote(id);
  await admin().from("gw_work_order_specs").delete().eq("id", specId).eq("company_id", actor.companyId);
  revalidatePath(`/q/${id}/work`);
}

/**
 * 組立データを残す／残さない を手で決める（#262。グリップ交換などは残さない）。value: on / off / auto
 */
export async function setAssemblyRecord(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const v = String(formData.get("value") ?? "auto");
  const { actor, full } = await mustQuote(id);
  if (!full.work) return;
  await admin()
    .from("gw_work_orders")
    .update({ assembly_record: v === "on" ? true : v === "off" ? false : null, updated_at: new Date().toISOString() })
    .eq("id", full.work.id)
    .eq("company_id", actor.companyId);
  revalidatePath(`/q/${id}/work`);
  revalidatePath("/w");
}

/**
 * 組立データ（組み上がりの実測）を保存する（#262）。
 * 1本でも数字が入っていて「組立」日が空なら、今日を組立日にする（工房ボードで次の段へ進む）。
 * お礼状の一言（thanks_note）もここで保存。【お礼状を印刷】から来たら保存のあと印刷画面へ。
 */
export async function saveAssemblyData(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const { actor, full } = await mustQuote(id);
  if (!full.work) return;

  let any = false;
  for (const s of full.specs) {
    const v = {
      actual_loft: num(formData.get(`a_loft_${s.id}`)),
      actual_lie: num(formData.get(`a_lie_${s.id}`)),
      actual_length: num(formData.get(`a_len_${s.id}`)),
      actual_weight: num(formData.get(`a_wt_${s.id}`)),
      actual_balance: txt(formData.get(`a_bal_${s.id}`)),
      actual_cpm: num(formData.get(`a_cpm_${s.id}`)),
      actual_head_weight: num(formData.get(`a_hw_${s.id}`)),
      grip_name: txt(formData.get(`a_grip_${s.id}`)),
      actual_note: txt(formData.get(`a_note_${s.id}`)),
    };
    const has = v.actual_length != null || v.actual_weight != null || v.actual_balance != null || v.actual_cpm != null;
    if (has) any = true;
    await admin()
      .from("gw_work_order_specs")
      .update({
        ...v,
        measured_at: has ? (s.measured_at ?? new Date().toISOString()) : null,
        measured_by: has ? (s.measured_by ?? actor.staffId) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", s.id)
      .eq("company_id", actor.companyId);
  }

  const w = full.work;
  const patch: Record<string, unknown> = {
    assembled_by_name: txt(formData.get("assembled_by_name")) ?? w.assembled_by_name,
    thanks_note: txt(formData.get("thanks_note")),
    updated_at: new Date().toISOString(),
  };
  const assembled = parseDay(txt(formData.get("assembled_on"))) ?? (any && !w.assembled_on ? todayJst() : w.assembled_on);
  patch.assembled_on = assembled;
  patch.status = workStatusOf({ ...w, assembled_on: assembled });
  await admin().from("gw_work_orders").update(patch).eq("id", w.id).eq("company_id", actor.companyId);

  revalidatePath(`/q/${id}/work`);
  revalidatePath("/w");
  afterSave(formData, id);
}
