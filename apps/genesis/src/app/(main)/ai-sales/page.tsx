import { requireGenesisActor } from "@/lib/auth";
import { getAiSalesLive } from "@/lib/ai-sales-live";
import { LiveBoard } from "./live-board";

/**
 * AI営業 司令室（#101）— AIの営業活動をリアルタイムに見る画面。
 * 上段: 稼働状態＋ファネル / 左: 投稿パイプライン / 右: 活動フィード（15秒ポーリング）。
 * 正典: docs/modules/ai-sales/SYSTEM.md
 */
export const dynamic = "force-dynamic";

export default async function AiSalesPage() {
  const actor = await requireGenesisActor();
  const initial = await getAiSalesLive(actor.companyId);
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold">AI営業 司令室</h1>
        <p className="mt-1 text-sm text-(--color-dim)">
          SNSインバウンド（PGA NOTE / SWING CORTEX）の生成→承認→投稿→閲覧→リードをリアルタイムに監視します。
          投稿の承認はホームの判断フィードで。
        </p>
      </div>
      <LiveBoard initial={initial} />
    </div>
  );
}
