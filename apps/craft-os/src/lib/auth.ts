import { createActorResolver, loginIdToEmail, type Actor } from "@yozan/core/auth";

/**
 * craft-os は use_craft 権限、または view_hq（経営層 #18）保持者のみ。
 * 見積の金額を触るため、閲覧専用・営業ロールには付けていない。
 * ロール・権限データはGenesis / Shift Cloudと共通（同一DB）。DECISIONS #27と同型。
 */
export const { getActor, requireActor } = createActorResolver({
  anyOf: ["use_craft", "view_hq"],
});

export { loginIdToEmail };
export type { Actor };
