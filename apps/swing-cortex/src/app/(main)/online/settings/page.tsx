import { hasAiKey } from "@/lib/ai";
import { requireOnlineActor, loadProfile, loadMembers } from "@/lib/online/data";
import { withDefaults } from "@/lib/online/reply";
import SettingsClient from "./settings-client";

export const dynamic = "force-dynamic";
// 数千件のトーク履歴CSVを取り込むので延長
export const maxDuration = 60;

export default async function OnlineSettingsPage() {
  const actor = await requireOnlineActor();
  const [profile, members] = await Promise.all([loadProfile(actor.companyId), loadMembers(actor.companyId)]);
  return (
    <SettingsClient
      profile={withDefaults(profile)}
      members={members.map((m) => ({ id: m.id, name: m.name }))}
      aiReady={hasAiKey()}
    />
  );
}
