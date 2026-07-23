import { createActorResolver, type Actor } from "@yozan/core/auth";

/**
 * SWING CORTEX（コーチング診断 / docs/modules/swing-cortex）
 * use_coaching 権限、または view_hq（経営層 #18）保持者のみ。
 * ロール・権限データはGenesis / Shift Cloudと共通（同一DB）。
 */
export type CoachActor = Actor;

const resolver = createActorResolver({ anyOf: ["use_coaching", "view_hq"] });

export const getCoachActor = resolver.getActor;
export const requireCoachActor = resolver.requireActor;
