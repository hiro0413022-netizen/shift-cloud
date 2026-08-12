import "server-only";
import { redirect } from "next/navigation";
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

/* ============================================================
   店舗スコープ（#134 / DECISIONS #128「店舗またぎ廃止」）

   GOLF WING（宝塚）と FRANK GOLF（姫路）は別店舗。
   Lesson OS の生徒台帳 lsn_students は両店が同居しているので、
   ここを通さずに company_id だけで引くと GOLF WING のコーチに
   FRANK の会員（#129 のWeb入会で自動生成されるカルテ）が並ぶ。
   ============================================================ */

/** FRANK GOLF 姫路の店舗ID（genesis / apps/lesson-os の frank ページと同じ定数） */
export const FRANK_STORE_ID = "b54afb9f-22aa-4f4e-b758-bc2157acfdd5";

/**
 * store_id 未設定の行を見せてよいか。
 *
 * lsn_students.store_id は 0041 から存在するが nullable。
 * FRANK 由来のカルテ（genesis の frank-join / frank-lesson）は FRANK_STORE_ID が入る一方、
 * GOLF WING の既存生徒と lesson-os から手で追加した生徒は未設定のまま。
 * 「未設定＝自店舗」と見なすと FRANK から宝塚の生徒が見えてしまうので、
 * 未設定行は FRANK 以外の店舗に配属されている人にだけ見せる。
 * 恒久対応は store_id のバックフィル＋NOT NULL 化（要マイグレーション 0112）。
 */
export function includesUnassigned(actor: LessonActor): boolean {
  return actor.isOwner || actor.storeIds.some((id) => id !== FRANK_STORE_ID);
}

/** 対象行の店舗に触れてよいか（UIの出し分けではなくサーバー側の最終防衛に使う） */
export function canAccessStore(actor: LessonActor, storeId: string | null): boolean {
  if (actor.isOwner) return true;
  if (storeId == null) return includesUnassigned(actor);
  return actor.storeIds.includes(storeId);
}

/** 何にも一致しない店舗ID（配属ゼロの人に全件を見せないための番人） */
const NO_STORE = "00000000-0000-0000-0000-000000000000";

type StoreFilterable<Q> = {
  in(column: string, values: readonly string[]): Q;
  is(column: string, value: null): Q;
  or(filters: string): Q;
};

/** lsn_students など store_id を持つテーブルに店舗スコープをかける（#134） */
export function withStoreScope<Q extends StoreFilterable<Q>>(q: Q, actor: LessonActor): Q {
  if (actor.isOwner) return q; // オーナー（manage_company）だけが全店を横断できる
  const unassigned = includesUnassigned(actor);
  if (actor.storeIds.length === 0) return unassigned ? q.is("store_id", null) : q.in("store_id", [NO_STORE]);
  return unassigned
    ? q.or(`store_id.in.(${actor.storeIds.join(",")}),store_id.is.null`)
    : q.in("store_id", actor.storeIds);
}

/** FRANK のレッスン枠・予約者名は FRANK に入れる人だけ（#134） */
export async function requireFrankActor(): Promise<LessonActor> {
  const actor = await requireLessonActor();
  if (!canAccessStore(actor, FRANK_STORE_ID)) redirect("/?denied=frank");
  return actor;
}

/** 見出しに出す範囲（オーナーだけが「全店」）。店舗名は Actor が持たないので範囲だけ示す */
export function scopeLabel(actor: LessonActor): string {
  if (actor.isOwner) return "全店";
  if (actor.storeIds.length === 0) return "店舗未設定";
  return "自店舗";
}
