import { requireLessonActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { ModelsClient, type ModelItem } from "./models-client";

/** コーチのお手本スイング（PGA NOTE準拠）— 生徒の共有ページにも表示される */
export default async function ModelsPage() {
  const actor = await requireLessonActor();
  const admin = createAdmin();
  const { data } = await admin
    .from("lsn_model_videos")
    .select("id, club, distance_yd, note, created_at, staff:coach_staff_id(name)")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(60);

  const items: ModelItem[] = (data ?? []).map((m) => ({
    id: m.id,
    club: m.club,
    distanceYd: m.distance_yd,
    note: m.note,
    coach: (m.staff as unknown as { name: string } | null)?.name ?? "",
    at: m.created_at.slice(0, 10),
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">お手本スイング</h1>
      <p className="text-sm text-(--color-dim)">
        コーチのお手本や施設独自のテクニック動画。生徒カルテの「比較再生」と生徒への共有ページに表示されます
      </p>
      <ModelsClient items={items} />
    </div>
  );
}
