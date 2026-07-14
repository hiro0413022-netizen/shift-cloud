"use server";

import { requireActor, can } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { askData, type AskDataResult } from "@yozan/core/ask-data";

/**
 * データに聞く（Ask Data / migration 0053・DECISIONS #56）
 *
 * スタッフポータル版。view_hq を持つ人（本部）は全社、それ以外は自店舗のみ。
 * 給与・経理・契約・問い合わせは scope='store' ではDB側で0行になる（gn_ctx_is_hq()）。
 * 店舗未割当の人は「全店が見える」状態になり得るので、ここで明示的に止める。
 */
export async function ask(question: string): Promise<AskDataResult> {
  const actor = await requireActor();
  const q = question.trim();
  const fail = (msg: string, code: string): AskDataResult => ({
    answer: msg,
    sql: null,
    rows: [],
    rowCount: 0,
    error: code,
    elapsedMs: 0,
  });

  if (!q) return fail("質問を入力してください。", "empty");

  const isHq = can(actor, "view_hq");
  const storeId = actor.primaryStoreId ?? actor.storeIds[0] ?? null;
  if (!isHq && !storeId) {
    return fail("所属店舗が設定されていないため利用できません。管理者に連絡してください。", "no_store");
  }

  return askData({
    question: q.slice(0, 500),
    companyId: actor.companyId,
    staffId: actor.staffId,
    scope: isHq ? "hq" : "store",
    storeId: isHq ? null : storeId,
    admin: createAdmin(),
  });
}
