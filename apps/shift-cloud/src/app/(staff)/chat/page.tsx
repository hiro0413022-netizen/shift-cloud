import { requireActor, can } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { brandFromStoreName } from "@yozan/core/reply-kb";
import { ChatClient } from "./chat-client";
import { ReplyAssistant } from "@/components/reply-assistant";
import { draft } from "./actions";
import { ChatTabs } from "./tabs";

/**
 * 聞く
 * - データに聞く（Ask Data / migration 0053・DECISIONS #56）
 *   店長・スタッフが数字を本部に聞かなくても自分で引ける場所。
 *   参照範囲は自店舗（給与・経理・契約はDB側で0行）。view_hq 保持者のみ全社。
 * - 返信文をつくる（公式LINE・メールの返信補助）
 *   GOLF WING / FRANK GOLF / YOZAN のナレッジ（@yozan/core/reply-kb）だけを根拠に返信案を作る。送信はしない。
 */
export default async function StaffChatPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const actor = await requireActor();
  const isHq = can(actor, "view_hq");
  const { tab } = await searchParams;

  let storeName: string | null = null;
  const storeId = actor.primaryStoreId ?? actor.storeIds[0] ?? null;
  if (storeId) {
    const { data } = await createAdmin().from("stores").select("name").eq("id", storeId).maybeSingle();
    if (data?.name) storeName = data.name;
  }

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold tracking-tight">聞く</h1>
      <p className="mb-3 text-sm text-zinc-500">数字の確認と、お客様への返信文づくり。</p>
      <ChatTabs
        initial={tab === "reply" ? "reply" : "ask"}
        ask={
          <>
            <p className="mb-4 text-sm text-zinc-500">売上・会員・体験予約・シフト・勤怠を日本語で質問できます。</p>
            <ChatClient
              scopeLabel={
                isHq ? "全社（全店舗）" : `${storeName ?? "所属店舗"}のみ（給与・経理・契約は参照できません）`
              }
            />
          </>
        }
        reply={<ReplyAssistant defaultBrand={brandFromStoreName(storeName)} draftFn={draft} />}
      />
    </div>
  );
}
