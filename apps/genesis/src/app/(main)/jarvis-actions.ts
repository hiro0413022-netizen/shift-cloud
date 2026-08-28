"use server";

import { requireGenesisActor, storeScope } from "@/lib/auth";
import { jarvisTurn, type JarvisReply } from "@/lib/jarvis";

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
  return jarvisTurn({
    actor,
    storeIds: storeScope(actor),
    said,
    history: Array.isArray(history) ? history.slice(-8) : [],
    inputMode: inputMode === "voice" ? "voice" : "text",
  });
}
