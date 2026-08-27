import "server-only";
import { createAdmin } from "@/lib/supabase/admin";

/**
 * 店の文体プロファイル（sc_settings.style / migration 0125）。
 * その店の実コメントから抽出した語彙・ドリル名・定番フレーズ・文体。
 * AIコメント下書きはこれを踏襲する＝店の言葉尻を維持する（2026-08-27 ユーザー方針）。
 */
export type StoreStyle = {
  vocab?: string[];
  drills?: string[];
  phrases?: string[];
  tone?: string;
};

/** sc_settings.style を読む（無ければ null） */
export async function loadStyle(companyId: string): Promise<StoreStyle | null> {
  const admin = createAdmin();
  const { data } = await admin.from("sc_settings").select("style").eq("company_id", companyId).maybeSingle();
  const style = (data as { style?: StoreStyle | null } | null)?.style ?? null;
  if (!style) return null;
  const has = (style.vocab?.length ?? 0) + (style.drills?.length ?? 0) + (style.phrases?.length ?? 0);
  return has > 0 || style.tone ? style : null;
}

/** プロンプトに入れる「この店の言葉」ブロックを組み立てる（無ければ空文字） */
export function styleLines(style: StoreStyle | null): string {
  if (!style) return "";
  const parts: string[] = [];
  if (style.vocab?.length) parts.push(`この店でよく使う具体語: ${style.vocab.join("・")}`);
  if (style.drills?.length) parts.push(`この店のドリル名・練習メニュー: ${style.drills.join("・")}`);
  if (style.phrases?.length) parts.push(`この店の定番フレーズ（そのまま使ってよい）: ${style.phrases.join(" ／ ")}`);
  if (style.tone) parts.push(`文体: ${style.tone}`);
  return parts.join("\n");
}
