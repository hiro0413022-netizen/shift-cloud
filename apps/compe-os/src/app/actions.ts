"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdmin } from "@yozan/core/supabase/admin";
import { requireActor } from "@/lib/auth";
import { DEFAULT_PRIZES, DEFAULT_RECEPTION_FIELDS, DEFAULT_SURVEY_QUESTIONS, getComp } from "@/lib/compe";

export async function createComp(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const heldOn = String(formData.get("held_on") ?? "").trim() || null;
  const storeId = String(formData.get("store_id") ?? "").trim() || null;

  const admin = createAdmin();
  const { data, error } = await admin
    .from("cmp_comps")
    .insert({
      company_id: actor.companyId,
      store_id: storeId,
      name,
      held_on: heldOn,
      created_by: actor.staffId,
      reception_fields: DEFAULT_RECEPTION_FIELDS,
      survey_questions: DEFAULT_SURVEY_QUESTIONS,
      ann_greeting:
        "平素より大変お世話になっております。\n下記の通りゴルフコンペを開催いたしますので、ご案内申し上げます。",
      ann_closing:
        "ご不明な点がございましたら、担当者までお問い合わせください。\nご参加を心よりお待ちしております。",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "コンペを作成できませんでした");

  // 景品は毎回同じ枠から始まるので既定を入れておく（空の一覧から手で足すのは当日つらい）
  await admin.from("cmp_prizes").insert(
    DEFAULT_PRIZES.map((p, i) => ({ comp_id: data.id, label: p.label, sort_order: i }))
  );

  revalidatePath("/");
  redirect(`/c/${data.id}/setup`);
}

/** 前回のコンペを土台に新しい回を作る（参加者・景品を引き継ぐ） */
export async function duplicateComp(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const srcId = String(formData.get("comp_id") ?? "");
  const src = await getComp(actor, srcId);
  if (!src) throw new Error("コンペが見つかりません");

  const admin = createAdmin();
  const { data: created, error } = await admin
    .from("cmp_comps")
    .insert({
      company_id: src.company_id,
      store_id: src.store_id,
      name: `${src.name}（コピー）`,
      held_on: null,
      venue: src.venue,
      course: src.course,
      organizer: src.organizer,
      contact: src.contact,
      fee: src.fee,
      start_time: src.start_time,
      meet_time: src.meet_time,
      format: src.format,
      team_size: src.team_size,
      tee_options: src.tee_options,
      notes: src.notes,
      ann_greeting: src.ann_greeting,
      ann_closing: src.ann_closing,
      ann_group_title: src.ann_group_title,
      ann_show_hcp: src.ann_show_hcp,
      survey_title: src.survey_title,
      survey_desc: src.survey_desc,
      survey_questions: src.survey_questions,
      reception_fields: src.reception_fields,
      sheet_cols: src.sheet_cols,
      created_by: actor.staffId,
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "複製できませんでした");

  // 参加者は名簿だけ引き継ぐ（受付・支払い・スコアは持ち込まない＝前回の受付済みが残る事故を防ぐ）
  const { data: srcPs } = await admin
    .from("cmp_participants")
    .select("name, kana, hcp, gender, org, tel, email, sort_order")
    .eq("comp_id", srcId)
    .is("deleted_at", null);
  if (srcPs?.length) {
    await admin
      .from("cmp_participants")
      .insert(srcPs.map((p) => ({ ...p, comp_id: created.id })));
  }

  const { data: srcPrizes } = await admin
    .from("cmp_prizes")
    .select("label, prize_name, sort_order")
    .eq("comp_id", srcId)
    .is("deleted_at", null);
  if (srcPrizes?.length) {
    await admin.from("cmp_prizes").insert(srcPrizes.map((p) => ({ ...p, comp_id: created.id })));
  }

  revalidatePath("/");
  redirect(`/c/${created.id}/setup`);
}

export async function deleteComp(formData: FormData): Promise<void> {
  const actor = await requireActor();
  const compId = String(formData.get("comp_id") ?? "");
  const comp = await getComp(actor, compId);
  if (!comp) throw new Error("コンペが見つかりません");
  // 論理削除（DECISIONS #5）
  await createAdmin().from("cmp_comps").update({ deleted_at: new Date().toISOString() }).eq("id", compId);
  revalidatePath("/");
  redirect("/");
}
