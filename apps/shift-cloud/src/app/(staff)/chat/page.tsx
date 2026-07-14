import { requireActor, can } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { ChatClient } from "./chat-client";

/**
 * データに聞く（Ask Data / migration 0053・DECISIONS #56）
 * 店長・スタッフが数字を本部に聞かなくても自分で引ける場所。
 * 参照範囲は自店舗（給与・経理・契約はDB側で0行）。view_hq 保持者のみ全社。
 */
export default async function StaffChatPage() {
  const actor = await requireActor();
  const isHq = can(actor, "view_hq");

  let storeName = "所属店舗";
  const storeId = actor.primaryStoreId ?? actor.storeIds[0] ?? null;
  if (!isHq && storeId) {
    const { data } = await createAdmin().from("stores").select("name").eq("id", storeId).maybeSingle();
    if (data?.name) storeName = data.name;
  }

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold tracking-tight">データに聞く</h1>
      <p className="mb-4 text-sm text-zinc-500">売上・会員・体験予約・シフト・勤怠を日本語で質問できます。</p>
      <ChatClient
        scopeLabel={isHq ? "全社（全店舗）" : `${storeName}のみ（給与・経理・契約は参照できません）`}
      />
    </div>
  );
}
