"use server";

// 巡回元（prs_sources）の編集と、手動での試し実行（#110）。
// 「自動で動く」ものほど、人が中身を見て直せる場所が要る。SQL直打ちにしない。

import { revalidatePath } from "next/cache";
import { createAdmin } from "@yozan/core/supabase/admin";
import { runProspectPickup } from "@yozan/prospect/server";
import { requireActor } from "@/lib/auth";
import { createAutoDemo } from "@/lib/auto-demo";

const s = (fd: FormData, k: string) => {
  const v = fd.get(k);
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
};

export async function saveSource(fd: FormData) {
  const actor = await requireActor();
  const admin = createAdmin();
  const id = s(fd, "id");
  const patch = {
    company_id: actor.companyId,
    name: s(fd, "name") ?? "（無題）",
    kind: s(fd, "kind") === "places" ? "places" : "directory",
    industry: s(fd, "industry") ?? "other",
    city: s(fd, "city"),
    url: s(fd, "url"),
    link_pattern: s(fd, "link_pattern"),
    query: s(fd, "query"),
    max_per_run: Math.max(1, Math.min(50, Number(s(fd, "max_per_run") ?? 10))),
    enabled: fd.get("enabled") === "on",
    sort: Number(s(fd, "sort") ?? 0),
    updated_at: new Date().toISOString(),
  };
  if (id) await admin.from("prs_sources").update(patch).eq("id", id).eq("company_id", actor.companyId);
  else await admin.from("prs_sources").insert(patch);
  revalidatePath("/sources");
}

export async function deleteSource(fd: FormData) {
  const actor = await requireActor();
  const admin = createAdmin();
  const id = s(fd, "id");
  if (!id) return;
  await admin
    .from("prs_sources")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  revalidatePath("/sources");
}

/**
 * いま試す。cronを待たずに1回だけ回す。
 * 予算は短め（画面が固まるため）。本番の巡回はcronが担当する。
 */
export async function runNow() {
  const actor = await requireActor();
  const admin = createAdmin();
  await runProspectPickup(admin, actor.companyId, {
    budgetMs: 45_000,
    maxNewProspects: 10,
    maxAudits: 8,
    maxDemos: 1,
    onDemo: (p) => createAutoDemo(admin, actor.companyId, p),
  });
  revalidatePath("/sources");
  revalidatePath("/");
}
