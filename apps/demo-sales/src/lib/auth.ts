import { createActorResolver, loginIdToEmail, type Actor } from "@yozan/core/auth";

/**
 * AI DEMO SALES は use_demo_sales 権限、または view_hq（経営層 #18）保持者のみ。
 * ロール・権限データはGenesis / Shift Cloudと共通（同一DB）。DECISIONS #27と同型。
 */
export const { getActor, requireActor } = createActorResolver({
  anyOf: ["use_demo_sales", "view_hq"],
});

export { loginIdToEmail };
export type { Actor };
