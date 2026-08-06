"use server";

import { requireGenesisActor } from "@/lib/auth";
import { getAiSalesLive, type AiSalesLive } from "@/lib/ai-sales-live";
import { runContentLoop, refreshContentMetrics } from "@/lib/content-loop";
import { createAdmin } from "@/lib/supabase/admin";

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

/**
 * 「反応数をいま取り込む」（#108）。通常は日次cronが1日1回やる。
 * 手で押しても課金は増えにくい（同じ投稿はUTC日内で重複課金されない）が、
 * 連打すれば日をまたいだぶんは課金されるので、画面側で実行中は押せなくしている。
 */
export async function refreshMetricsNow(): Promise<Record<string, unknown>> {
  const actor = await requireGenesisActor();
  return refreshContentMetrics(createAdmin(), actor.companyId) as unknown as Promise<Record<string, unknown>>;
}
