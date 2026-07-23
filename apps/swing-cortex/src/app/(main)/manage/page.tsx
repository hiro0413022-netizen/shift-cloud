import { requireCoachActor } from "@/lib/auth";
import { loadManageTree } from "@/lib/data";
import ManageClient from "./manage-client";

export const dynamic = "force-dynamic";

export default async function ManagePage() {
  const actor = await requireCoachActor();
  const tree = await loadManageTree(actor.companyId);
  return <ManageClient tree={tree} />;
}
