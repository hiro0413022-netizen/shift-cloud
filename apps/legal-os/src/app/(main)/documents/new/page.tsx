import { redirect } from "next/navigation";
import { requireLegalActor } from "@/lib/auth";
import { listSegments } from "@/lib/legal";
import { Panel } from "@/components/ui";
import { NewForm } from "./new-form";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage() {
  const actor = await requireLegalActor();
  if (!actor.canWrite) redirect("/documents");
  const segments = await listSegments(actor);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-lg font-bold tracking-wide">契約を登録</h1>
      <Panel>
        <NewForm segments={segments.map((s) => ({ id: s.id, name: s.name }))} />
      </Panel>
    </div>
  );
}
