"use server";

import { revalidatePath } from "next/cache";
import { requireGenesisActor } from "@/lib/auth";
import { readFocus, writeFocus } from "@/lib/focus";

/** Focus / CEO モードの切替（#304）。cookie に保存し、全画面を描き直す */
export async function updateFocus(formData: FormData) {
  const actor = await requireGenesisActor();
  const cur = await readFocus(actor);
  const store = String(formData.get("store") ?? "");
  const project = String(formData.get("project") ?? "");
  const ceo = formData.get("ceo") === "1";
  await writeFocus({
    store: store && cur.stores.some((s) => s.id === store) ? store : null,
    project: project && cur.projects.some((p) => p.id === project) ? project : null,
    ceo: actor.isOwner && ceo,
  });
  revalidatePath("/", "layout");
}
