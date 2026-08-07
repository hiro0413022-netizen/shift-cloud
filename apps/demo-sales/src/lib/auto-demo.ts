// cronから呼ぶデモ生成（#110）。
//
// 画面から呼ぶ generateDemo（app/actions.ts）との違いは2つだけ:
//   - ログインセッションが無いので requireActor を通らない（company_id は呼び出し側が渡す）
//   - 既にデモがある営業先は触らない（自動で版を上げると、面談中に見せている画面が変わる）
//
// 中身（brief → HTML）は renderDemo をそのまま使う。ここで別の作り方をすると
// 「手で作ったデモ」と「自動で作ったデモ」で見た目が分かれ、正典が二重になる。

import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderDemo } from "./render-demo";
import { getTemplate } from "./templates";
import type { DemoBrief, IndustryKey } from "./types";

export interface AutoDemoInput {
  id: string;
  name: string;
  industry: string;
  phone: string | null;
  address: string | null;
  score: number;
}

/**
 * 営業先1件ぶんのデモを生成する。
 * @returns 生成したら true / 既にデモがあるなど作らなかったら false
 */
export async function createAutoDemo(admin: SupabaseClient, companyId: string, p: AutoDemoInput): Promise<boolean> {
  const { data: exists } = await admin
    .from("dms_demos")
    .select("id")
    .eq("prospect_id", p.id)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (exists) return false;

  // getTemplate は未知の業種キーを other に丸めるので、その戻り値をそのまま業種として採用する
  const industry = getTemplate(p.industry).key as IndustryKey;
  const brief: DemoBrief = {
    clinicName: p.name,
    industry,
    phone: p.phone ?? undefined,
    address: p.address ?? undefined,
    // 中身は業種テンプレートの仮データ（※仮ラベル付き）。実データは面談前に人が上書きする。
    // ここでAIに文章を書かせないのは、送る前に必ず人が見る前提だから（下書きの品質より、作られていることが重要）。
  };

  const html = renderDemo(brief);
  const expires = new Date();
  expires.setDate(expires.getDate() + 60);

  const { error } = await admin.from("dms_demos").insert({
    company_id: companyId,
    prospect_id: p.id,
    version: 1,
    token: randomBytes(18).toString("base64url"),
    template_key: industry,
    brief,
    html,
    status: "ready",
    expires_on: expires.toISOString().slice(0, 10),
  });
  if (error) throw new Error(error.message);

  await admin.from("dms_prospects").update({ status: "demo_done" }).eq("id", p.id);
  await admin.from("dms_activities").insert({
    company_id: companyId,
    prospect_id: p.id,
    kind: "note",
    content: `自動生成: Web現況スコア${p.score}点のため営業デモを作成（送信前に内容の確認が必要）`,
    created_by: "AI（自動ピックアップ）",
  });
  return true;
}
