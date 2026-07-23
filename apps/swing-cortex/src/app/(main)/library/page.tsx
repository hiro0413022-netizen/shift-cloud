import { requireCoachActor } from "@/lib/auth";
import { loadSymptomTree } from "@/lib/data";
import LibraryClient from "./library-client";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const actor = await requireCoachActor();
  const tree = await loadSymptomTree(actor.companyId);
  return <LibraryClient tree={tree} />;
}
