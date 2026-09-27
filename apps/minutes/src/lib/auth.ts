import { createActorResolver, loginIdToEmail, type Actor } from "@yozan/core/auth";

/**
 * 議事録 は use_minutes 権限、または view_hq（経営層 #18）保持者のみ。
 * ロール・権限データはGenesis / Shift Cloudと共通（同一DB）。DECISIONS #27と同型。
 */
export const { getActor, requireActor } = createActorResolver({
  anyOf: ["use_minutes", "view_hq"],
});

export { loginIdToEmail };
export type { Actor };
