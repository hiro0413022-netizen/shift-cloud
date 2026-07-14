import { createActorResolver, type Actor } from "@yozan/core/auth";

/**
 * Member OS（体験受付） は use_reception 権限、または view_hq（経営層 #18）保持者のみ。
 * ロール・権限データはGenesis / Shift Cloudと共通（同一DB）。DECISIONS #27と同型。
 * 実装は @yozan/core/auth に集約（DECISIONS #35。挙動は従来と同一: active・read_only除外・anyOf判定）。
 */
export type ReceptionActor = Actor;

const resolver = createActorResolver({ anyOf: ["use_reception", "view_hq"] });

export const getReceptionActor = resolver.getActor;
export const requireReceptionActor = resolver.requireActor;
