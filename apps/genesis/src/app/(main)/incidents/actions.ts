"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor, assertStoreAccess } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { runIncidentAnalysis } from "@/lib/incident-analysis";

/** 再発防止策の進捗を進める（未着手→対応中→完了 / 見送り） */
export async function updateInsightStatus(id: string, status: string, note: string): Promise<{ error?: string }> {
  const actor = await requireGenesisActor();
  if (!["open", "doing", "done", "dismissed"].includes(status)) return { error: "状態が不正です" };
  const admin = createAdmin();

  // #134: 他店舗の対策を書き換えられないようサーバー側で検証（UIに出ていないIDを直接叩かれても止める）
  const { data: target } = await admin
    .from("sp_incident_insights")
    .select("store_id")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!target) return { error: "対象が見つかりません" };
  try {
    assertStoreAccess(actor, (target as { store_id: string | null }).store_id);
  } catch {
    return { error: "他店舗のデータは変更できません" };
  }

  const { error } = await admin
    .from("sp_incident_insights")
    .update({ status, status_note: note.trim().slice(0, 1000) || null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null);
  if (error) return { error: error.message };
  revalidatePath("/incidents");
  return {};
}

/**
 * 手動で分析を回す。
 * 翌朝の自動実行を待たずに今すぐ見たい時用（報告を入れた直後など）。
 */
export async function analyzeNow(): Promise<{ error?: string; message?: string }> {
  const actor = await requireGenesisActor();
  const r = await runIncidentAnalysis(actor.companyId);
  revalidatePath("/incidents");
  if (r.incidents === 0) return { message: "報告がまだないため分析できません" };
  if (r.created === 0) return { message: `報告${r.incidents}件を分析しました（新しい対策はありません）` };
  const engine = r.engine === "claude" ? "AI" : "ルール（AIキー未設定または応答なし）";
  return { message: `報告${r.incidents}件から対策を${r.created}件つくりました（${engine}）` };
}
