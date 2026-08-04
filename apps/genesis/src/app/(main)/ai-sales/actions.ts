"use server";

import { requireGenesisActor } from "@/lib/auth";
import { getAiSalesLive, type AiSalesLive } from "@/lib/ai-sales-live";
import { runContentLoop } from "@/lib/content-loop";

/** ライブボードのポーリング用（15秒ごとにクライアントから呼ばれる） */
export async function fetchAiSalesLive(): Promise<AiSalesLive> {
  const actor = await requireGenesisActor();
  return getAiSalesLive(actor.companyId);
}

/** 「今日の投稿案をいま作る」（cronを待たずに動作確認したいとき） */
export async function runContentLoopNow(): Promise<Record<string, unknown>> {
  const actor = await requireGenesisActor();
  return runContentLoop(actor.companyId);
}
