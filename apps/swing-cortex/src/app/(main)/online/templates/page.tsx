import { requireOnlineActor, loadTemplates } from "@/lib/online/data";
import TemplatesClient from "./templates-client";

export const dynamic = "force-dynamic";

export default async function OnlineTemplatesPage() {
  const actor = await requireOnlineActor();
  return <TemplatesClient templates={await loadTemplates(actor.companyId)} />;
}
