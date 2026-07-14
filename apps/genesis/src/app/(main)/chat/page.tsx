import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { ChatClient } from "./chat-client";

/**
 * データに聞く（Ask Data / migration 0053・DECISIONS #56）
 *
 * 日次レポートは「押し出し」なので、聞きたいことを聞けなかった。ここで聞ける。
 * LLMが書くのはSQLだけで、数字はPostgresが計算する。生成SQLと件数を必ず表示する。
 * Genesisは view_hq 専用 → scope='hq'（全店舗・給与・経理・契約まで）。
 */
export default async function ChatPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();

  const { count } = await admin
    .from("gn_chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("company_id", actor.companyId);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">データに聞く</h1>
      <p className="mb-6 text-sm text-(--color-dim)">
        売上・会員・体験予約・勤怠・給与・経理・契約に、日本語で直接質問できます。
        {count ? `　これまでの質問 ${count} 件` : ""}
      </p>
      <ChatClient scopeLabel="全社（全店舗・給与・経理・契約を含む）" />
    </div>
  );
}
