"use server";

import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { askData, type AskDataResult } from "@yozan/core/ask-data";

/**
 * データに聞く（Ask Data / migration 0053）
 * Genesisは view_hq 専用なので scope='hq'（全店舗・給与・経理まで参照可）。
 * 数字はすべてPostgresが計算し、生成SQLと件数を返す（LLMは答えを作らない）。
 */
export async function ask(question: string): Promise<AskDataResult> {
  const actor = await requireGenesisActor();
  const q = question.trim();
  if (!q) {
    return { answer: "質問を入力してください。", sql: null, rows: [], rowCount: 0, error: "empty", elapsedMs: 0 };
  }
  return askData({
    question: q.slice(0, 500),
    companyId: actor.companyId,
    staffId: actor.staffId,
    scope: "hq",
    admin: createAdmin(),
  });
}
