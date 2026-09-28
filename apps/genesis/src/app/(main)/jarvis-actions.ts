"use server";

import { requireGenesisActor, storeScope } from "@/lib/auth";
import { jarvisTurn, type JarvisReply } from "@/lib/jarvis";
import { readFocus } from "@/lib/focus";

/**
 * ホームの対話AI（JARVIS）の1ターン（DECISIONS #182）。
 * 意図判定・Ask Data・開発依頼の受付は lib/jarvis.ts が担う。ここは入口だけ。
 */
export async function talkToJarvis(
  said: string,
  history: { role: "user" | "assistant"; text: string }[],
  inputMode: "text" | "voice"
): Promise<JarvisReply> {
  const actor = await requireGenesisActor();
  // Focus（#304）: 店舗に絞っていればブリーフィングもその店だけ
  const focus = await readFocus(actor);
  return jarvisTurn({
    actor,
    storeIds: focus.store ? [focus.store] : storeScope(actor),
    focus: { store: focus.store, project: focus.project, ceo: focus.ceo, storeName: focus.storeName, projectName: focus.projectName },
    said,
    history: Array.isArray(history) ? history.slice(-8) : [],
    inputMode: inputMode === "voice" ? "voice" : "text",
  });
}
