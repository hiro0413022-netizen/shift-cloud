import "server-only";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * エディション（プラン）解決 / docs/modules/swing-cortex/SYSTEM.md §12
 * 販売版 = standard（P1+P2: 診断・ライブラリ・インサイト・AIコメント）。
 * 自社/pro = 全機能（+ P3 生徒コンテキスト/カルテCRM）。
 * sc_settings に行が無ければ standard（安全側＝売る仕様）。
 */

export type Plan = "standard" | "pro";

/** 画面モード: coaching=従来の診断ナレッジ / online=オンラインレッスン（LINE返信デスク）※0182 */
export type Mode = "coaching" | "online";

export type Features = {
  plan: Plan;
  mode: Mode;
  /** P3: 生徒台帳・カルテ保存・パーソナライズ（proのみ） */
  studentCrm: boolean;
};

function featuresForPlan(plan: Plan, mode: Mode = "coaching"): Features {
  return {
    plan,
    mode,
    studentCrm: plan === "pro",
  };
}

/** テナントの機能セットを返す（行なし=standard） */
export async function loadFeatures(companyId: string): Promise<Features> {
  const admin = createAdmin();
  const { data } = await admin.from("sc_settings").select("plan, mode").eq("company_id", companyId).maybeSingle();
  const row = data as { plan?: string; mode?: string } | null;
  const plan = (row?.plan === "pro" ? "pro" : "standard") as Plan;
  const mode = (row?.mode === "online" ? "online" : "coaching") as Mode;
  return featuresForPlan(plan, mode);
}
