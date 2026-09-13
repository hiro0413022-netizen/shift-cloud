"use server";

import { revalidatePath } from "next/cache";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { getQuote } from "@/lib/craft";
import { postSales } from "@/lib/sales";

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
  if (full.work) return;

  const { data: seq } = await admin().rpc("gw_next_work_order_seq", { p_company: actor.companyId });
  const n = Number(seq ?? 1);

  const { data, error } = await admin()
    .from("gw_work_orders")
    .insert({
      company_id: actor.companyId,
      store_id: full.quote.store_id,
      quote_id: id,
      order_seq: n,
      order_no: `W-${String(n).padStart(4, "0")}`,
      created_by: actor.staffId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "注文書を作成できませんでした");

  const shafts = full.items.filter((it) => it.line_kind === "product" && it.item_category === "シャフト");
  if (shafts.length > 0) {
    await admin()
      .from("gw_work_order_specs")
      .insert(
        shafts.map((it, i) => ({
          company_id: actor.companyId,
          work_order_id: data.id,
          line_no: i + 1,
          priority: i + 1,
          quote_item_id: it.id,
          length_min: it.finish_length_inch,
          length_max: it.finish_length_inch,
        }))
      );
  }

  await admin().from("gw_quotes").update({ status: "accepted" }).eq("id", id).eq("company_id", actor.companyId);
  revalidatePath(`/q/${id}/work`);
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
  for (const s of steps) patch[s] = txt(formData.get(s));

  // 状態は進捗から決める（手で選ばせない＝画面と実態がずれない）
  patch.status = patch.paid_on
    ? "closed"
    : patch.delivered_on
      ? "delivered"
      : patch.assembled_on
        ? "ready"
        : patch.arrived_on
          ? "arrived"
          : patch.ordered_on
            ? "ordered"
            : "open";

  await admin().from("gw_work_orders").update(patch).eq("id", full.work.id).eq("company_id", actor.companyId);

  // お渡しが入ったら、その場で Money OS へ売上を計上する（二重計上は関数側で防ぐ）
  if (patch.delivered_on) await postSales(actor, id);

  revalidatePath(`/q/${id}/work`);
  revalidatePath(`/q/${id}/quote`);
  revalidatePath("/");
}

/**
 * 発注管理の「発注プール」へ下書きを作る。
 * 仕入先ごとに1件ずつ。あとは発注管理の画面からいつもどおり送るだけ。
 */
export async function createPurchaseDrafts(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const { actor } = await mustQuote(id);
  const { error } = await admin().rpc("gw_create_purchase_drafts", {
    p_company: actor.companyId,
    p_quote_id: id,
    p_ordered_by: actor.name,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/q/${id}/work`);
}

/** 組立仕様。目標（範囲）と実測を、同じ画面で別の列として持つ */
export async function saveSpecs(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const { actor, full } = await mustQuote(id);
  if (!full.work) return;

  for (const s of full.specs) {
    const hasActual =
      num(formData.get(`a_cpm_${s.id}`)) != null ||
      txt(formData.get(`a_bal_${s.id}`)) != null ||
      num(formData.get(`a_len_${s.id}`)) != null ||
      num(formData.get(`a_wt_${s.id}`)) != null;

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
        actual_cpm: num(formData.get(`a_cpm_${s.id}`)),
        actual_balance: txt(formData.get(`a_bal_${s.id}`)),
        actual_length: num(formData.get(`a_len_${s.id}`)),
        actual_weight: num(formData.get(`a_wt_${s.id}`)),
        actual_head_weight: num(formData.get(`a_hw_${s.id}`)),
        actual_note: txt(formData.get(`a_note_${s.id}`)),
        measured_at: hasActual ? (s.measured_at ?? new Date().toISOString()) : null,
        measured_by: hasActual ? (s.measured_by ?? actor.staffId) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", s.id)
      .eq("company_id", actor.companyId);
  }
  revalidatePath(`/q/${id}/work`);
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

export async function removeSpecLine(formData: FormData): Promise<void> {
  const id = Number(formData.get("quote_id"));
  const specId = Number(formData.get("spec_id"));
  const { actor } = await mustQuote(id);
  await admin().from("gw_work_order_specs").delete().eq("id", specId).eq("company_id", actor.companyId);
  revalidatePath(`/q/${id}/work`);
}
