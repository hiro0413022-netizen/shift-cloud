import { requireOnlineActor, loadInbox, monthStats } from "@/lib/online/data";
import InboxClient from "./inbox-client";

export const dynamic = "force-dynamic";

export default async function OnlineInboxPage() {
  const actor = await requireOnlineActor();
  const [rows, stats] = await Promise.all([loadInbox(actor.companyId), monthStats(actor.companyId)]);
  return <InboxClient rows={rows} repliesThisMonth={stats.repliesThisMonth} />;
}
