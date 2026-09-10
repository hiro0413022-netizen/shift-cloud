"use server";

import { revalidatePath } from "next/cache";
import { createAdmin } from "@yozan/core/supabase/admin";
import { calcItemBack, type ItemKind, type SlipItemInput } from "@yozan/core/night-payroll";
import { requireActor } from "@/lib/auth";
import { getActiveRules, resolveNightStore } from "@/lib/night";

/**
 * 明細を1行足す。
 * バックはここで確定させて back_amount / back_basis に焼き付ける。
 * 画面の「バック ¥750」と、月末に出る金額が同じであることを保証するため、
 * 表示も保存も @yozan/core/night-payroll の calcItemBack を通す。
 */
export async function addItem(formData: FormData) {
  const actor = await requireActor();
  const store = await resolveNightStore();
  if (!store) throw new Error("店舗が見つかりません");

  const slipId = String(formData.get("slipId") ?? "");
  const kind = String(formData.get("kind") ?? "") as ItemKind;
  const ruleRef = String(formData.get("ruleRef") ?? "") || null;
  const qty = Math.max(1, Number(formData.get("qty") ?? 1));
  const castId = String(formData.get("castId") ?? "") || null;
  const customAmount = Number(formData.get("amount") ?? 0);

  const { rules } = await getActiveRules(store.id);

  let label = "";
  let unitPrice = 0;
  if (kind === "cast_drink") {
    const drink = rules.drinks.find((d) => `drink:${d.id}` === ruleRef);
    if (!drink) throw new Error("ドリンクの種類が選ばれていません");
    label = `キャストドリンク（${drink.label}）`;
    unitPrice = drink.price;
  } else if (kind === "bottle") {
    label = String(formData.get("label") ?? "ボトル");
    unitPrice = customAmount;
  } else if (kind === "nomination") {
    label = "本指名";
    unitPrice = rules.price.nomination;
  } else if (kind === "inhouse_nomination") {
    label = "場内指名";
    unitPrice = rules.price.inhouseNomination;
  } else if (kind === "douhan") {
    label = "同伴";
    unitPrice = rules.price.douhan;
  } else if (kind === "extend") {
    label = `延長 ${rules.price.extendMinutes}分`;
    unitPrice = rules.price.extendPerGuest;
  } else {
    label = String(formData.get("label") ?? "その他");
    unitPrice = customAmount;
  }

  const amount = unitPrice * qty;
  const input: SlipItemInput = {
    kind,
    amount,
    qty,
    castId,
    drinkRuleId: ruleRef?.startsWith("drink:") ? ruleRef.slice(6) : null,
  };
  const back = calcItemBack(rules, input);

  const admin = createAdmin();
  const { error } = await admin.from("nite_slip_items").insert({
    company_id: store.companyId,
    store_id: store.id,
    slip_id: slipId,
    kind,
    label,
    unit_price: unitPrice,
    qty,
    amount,
    cast_id: castId,
    rule_ref: ruleRef,
    back_amount: back.amount,
    back_basis: back.basis,
    created_by: actor.staffId,
  });
  if (error) throw new Error(error.message);

  // 延長したらセット時間も伸ばす（フロアの残り時間の表示がこれで合う）
  if (kind === "extend") {
    const { data: slip } = await admin.from("nite_slips").select("set_minutes").eq("id", slipId).single();
    await admin
      .from("nite_slips")
      .update({ set_minutes: (slip?.set_minutes ?? 60) + rules.price.extendMinutes * qty })
      .eq("id", slipId);
  }

  revalidatePath(`/slips/${slipId}`);
  revalidatePath("/floor");
}

/** 取り消し。行は消さず void にする（誰がいつ消したかが残る） */
export async function voidItem(formData: FormData) {
  const actor = await requireActor();
  const itemId = String(formData.get("itemId") ?? "");
  const slipId = String(formData.get("slipId") ?? "");
  const admin = createAdmin();
  const { error } = await admin
    .from("nite_slip_items")
    .update({
      status: "void",
      back_amount: 0,
      void_reason: String(formData.get("reason") ?? "") || null,
      voided_by: actor.staffId,
      voided_at: new Date().toISOString(),
    })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
  revalidatePath(`/slips/${slipId}`);
  revalidatePath("/floor");
}

/** あとから担当キャストを入れる／変える。バックも入れ直す */
export async function setItemCast(formData: FormData) {
  await requireActor();
  const store = await resolveNightStore();
  if (!store) throw new Error("店舗が見つかりません");
  const itemId = String(formData.get("itemId") ?? "");
  const slipId = String(formData.get("slipId") ?? "");
  const castId = String(formData.get("castId") ?? "") || null;

  const { rules } = await getActiveRules(store.id);
  const admin = createAdmin();
  const { data: item } = await admin
    .from("nite_slip_items")
    .select("kind, amount, qty, rule_ref, status")
    .eq("id", itemId)
    .single();
  if (!item) throw new Error("明細が見つかりません");

  const back = calcItemBack(rules, {
    kind: item.kind as ItemKind,
    amount: item.amount,
    qty: item.qty,
    castId,
    drinkRuleId: (item.rule_ref as string | null)?.startsWith("drink:") ? (item.rule_ref as string).slice(6) : null,
    status: item.status as "active" | "void",
  });

  await admin
    .from("nite_slip_items")
    .update({ cast_id: castId, back_amount: back.amount, back_basis: back.basis })
    .eq("id", itemId);

  revalidatePath(`/slips/${slipId}`);
  revalidatePath("/floor");
}

/**
 * 「このお客様を連れてきたのは」を変える。
 * ここを変えると、その日の時給アップ（同伴・紹介で+20%）が付く人が変わる。
 */
export async function setBroughtBy(formData: FormData) {
  await requireActor();
  const slipId = String(formData.get("slipId") ?? "");
  const castId = String(formData.get("castId") ?? "") || null;
  const kind = castId ? (String(formData.get("broughtKind") ?? "douhan") as "douhan" | "referral") : "free";
  const admin = createAdmin();
  const { error } = await admin
    .from("nite_slips")
    .update({ brought_by_cast_id: castId, brought_kind: kind })
    .eq("id", slipId);
  if (error) throw new Error(error.message);
  revalidatePath(`/slips/${slipId}`);
  revalidatePath("/floor");
  revalidatePath("/owner");
}
