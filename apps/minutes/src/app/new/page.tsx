import { jstYmd } from "@yozan/core/jst";
import { requireActor } from "@/lib/auth";
import { LEVELS, LEVEL_INFO, levelStatus } from "@/lib/levels";
import { MODES } from "@/lib/modes";
import { Header } from "@/components/header";
import { NewMeetingForm } from "./form";

export const dynamic = "force-dynamic";

export default async function NewPage() {
  const actor = await requireActor();
  const levels = LEVELS.map((l) => ({ id: l, ...LEVEL_INFO[l], ...levelStatus(l, process.env) }));
  const modes = MODES.map((m) => ({ id: m.id, label: m.label, desc: m.desc, requiresLevel: m.requiresLevel ?? null }));
  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Header name={actor.name} />
      <h2 className="mb-4 text-lg font-semibold">新しい議事録</h2>
      <NewMeetingForm today={jstYmd()} levels={levels} modes={modes} />
    </main>
  );
}
