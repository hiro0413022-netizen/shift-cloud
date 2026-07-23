import "server-only";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * エディション（プラン）解決 / docs/modules/swing-cortex/SYSTEM.md §12
 * 販売版 = standard（P1+P2: 診断・ライブラリ・インサイト・AIコメント）。
 * 自社/pro = 全機能（+ P3 生徒コンテキスト/カルテCRM）。
 * sc_settings に行が無ければ standard（安全側＝売る仕様）。
 */

export type Plan = "standard" | "pro";

export type Features = {
  plan: Plan;
  /** P3: 生徒台帳・カルテ保存・パーソナライズ（proのみ） */
  studentCrm: boolean;
};

function featuresForPlan(plan: Plan): Features {
  return {
    plan,
    studentCrm: plan === "pro",
  };
}

/** テナントの機能セットを返す（行なし=standard） */
export async function loadFeatures(companyId: string): Promise<Features> {
  const admin = createAdmin();
  const { data } = await admin.from("sc_settings").select("plan").eq("company_id", companyId).maybeSingle();
  const plan = ((data as { plan?: string } | null)?.plan === "pro" ? "pro" : "standard") as Plan;
  return featuresForPlan(plan);
}
