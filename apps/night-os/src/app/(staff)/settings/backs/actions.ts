"use server";

import { revalidatePath } from "next/cache";
import { createAdmin } from "@yozan/core/supabase/admin";
import { defaultRuleSet, type RuleSet } from "@yozan/core/night-payroll";
import { requireActor } from "@/lib/auth";
import { businessDate, getActiveRules, resolveNightStore } from "@/lib/night";

/**
 * バック設定の保存。
 * 上書きではなく「新しい版を作って、古い版を降ろす」。
 * 確定済みの給与は焼き付けた金額を使うので、過去に遡って金額が変わることはない。
 */
export async function saveRules(rules: RuleSet, businessType: RuleSet["businessType"]) {
  const actor = await requireActor();
  const store = await resolveNightStore();
  if (!store) throw new Error("店舗が見つかりません");
  const admin = createAdmin();

  await admin.from("nite_rulesets").update({ is_active: false }).eq("store_id", store.id).eq("is_active", true);
  const { error } = await admin.from("nite_rulesets").insert({
    company_id: store.companyId,
    store_id: store.id,
    business_type: businessType,
    name: `${businessDate()} 版`,
    rules,
    effective_from: businessDate(),
    is_active: true,
    created_by: actor.staffId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/settings/backs");
  revalidatePath("/floor");
}

/** 業態プリセットに戻す（キャバクラ / ガールズバー・ラウンジ） */
export async function applyPreset(formData: FormData) {
  const businessType = String(formData.get("businessType") ?? "cabaret") as RuleSet["businessType"];
  await saveRules(defaultRuleSet(businessType), businessType);
}

/** フォームからの保存 */
export async function saveFromForm(formData: FormData) {
  const store = await resolveNightStore();
  if (!store) throw new Error("店舗が見つかりません");
  const current = await getActiveRules(store.id);
  const num = (k: string, fallback: number) => {
    const v = Number(formData.get(k));
    return Number.isFinite(v) ? v : fallback;
  };

  const next: RuleSet = {
    ...current.rules,
    serviceRate: num("serviceRate", current.rules.serviceRate * 100) / 100,
    taxRate: num("taxRate", current.rules.taxRate * 100) / 100,
    price: {
      ...current.rules.price,
      setPerGuest: num("setPerGuest", current.rules.price.setPerGuest),
      nomination: num("priceNomination", current.rules.price.nomination),
      inhouseNomination: num("priceInhouse", current.rules.price.inhouseNomination),
      douhan: num("priceDouhan", current.rules.price.douhan),
    },
    nominationBack: {
      nomination: num("backNomination", current.rules.nominationBack.nomination),
      inhouseNomination: num("backInhouse", current.rules.nominationBack.inhouseNomination),
      douhan: num("backDouhan", current.rules.nominationBack.douhan),
    },
    drinks: current.rules.drinks.map((d) => ({
      ...d,
      price: num(`drink_${d.id}_price`, d.price),
      backValue: num(`drink_${d.id}_back`, d.backValue),
    })),
    bottleTiers: current.rules.bottleTiers.map((t) => ({
      ...t,
      percent: num(`tier_${t.id}_percent`, t.percent),
    })),
    upliftRules: current.rules.upliftRules.map((r) => ({
      ...r,
      effect: { ...r.effect, value: num(`uplift_${r.id}_value`, r.effect.value) },
      enabled: formData.get(`uplift_${r.id}_enabled`) === "on",
    })),
    deductions: current.rules.deductions.map((d) => ({
      ...d,
      value: num(`ded_${d.id}_value`, d.value),
      enabled: formData.get(`ded_${d.id}_enabled`) === "on",
    })),
  };

  await saveRules(next, current.businessType);
}
