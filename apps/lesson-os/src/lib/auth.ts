import { createActorResolver, type Actor } from "@yozan/core/auth";

/**
 * Lesson OS（スイング動画・コーチコメント / DECISIONS #49）
 * use_lesson 権限、または view_hq（経営層 #18）保持者のみ。
 * ロール・権限データはGenesis / Shift Cloudと共通（同一DB）。
 */
export type LessonActor = Actor;

const resolver = createActorResolver({ anyOf: ["use_lesson", "view_hq"] });

export const getLessonActor = resolver.getActor;
export const requireLessonActor = resolver.requireActor;
