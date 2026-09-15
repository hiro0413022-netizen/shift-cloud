import { notFound } from "next/navigation";
import { hasAiKey } from "@/lib/ai";
import { requireOnlineActor, loadMember, loadThread, loadVideos, loadTemplates } from "@/lib/online/data";
import Workspace from "../workspace-client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function OnlineMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireOnlineActor();
  const member = await loadMember(actor.companyId, id);
  if (!member) notFound();
  const [thread, videos, templates] = await Promise.all([
    loadThread(actor.companyId, id, 80),
    loadVideos(actor.companyId),
    loadTemplates(actor.companyId),
  ]);
  return <Workspace member={member} thread={thread} videos={videos} templates={templates} aiReady={hasAiKey()} />;
}
