import { requireOnlineActor, loadVideos } from "@/lib/online/data";
import VideosClient from "./videos-client";

export const dynamic = "force-dynamic";

export default async function OnlineVideosPage() {
  const actor = await requireOnlineActor();
  return <VideosClient videos={await loadVideos(actor.companyId)} />;
}
