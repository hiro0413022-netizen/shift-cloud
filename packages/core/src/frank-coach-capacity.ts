/**
 * 体験の同時受入数を「その時間にいるコーチの人数」で決める（#212・2026-09-03 ユーザー依頼）
 *
 * ユーザー指示:「シフトを読み込んでコーチが2人いるときは2人まで対応可能、3人目不可。
 *                1人のときは1人まで」
 *
 * ★ 判断に使うのは確定（公開）シフトだけ。下書きは店の中の検討中の予定で、
 *   それで受け入れを増やすと「来たけれど担当がいない」を作る。
 *
 * ★ コーチは「体験の最初から最後まで」いる人だけ数える。
 *   18:45上がりの人に18:00開始（約55分）の体験は任せられない。
 *   途中まで在席、を1人と数えると席だけ埋まって担当が消える。
 *
 * ★ シフトがまだ確定していない日は 2名まで（NO_SHIFT_CAPACITY）。
 *   0にするとシフト作成が遅れた期間の申込が全部止まり、
 *   打席数（3）のままにすると人が足りない時間に3件入る。その間を取る。
 */

/** 分で表した時間帯（8:45 → 525） */
export type Span = { s: number; e: number };

/** シフトが1件も確定していない日に受け入れる人数（ユーザー決定・2026-09-03） */
export const NO_SHIFT_CAPACITY = 2;

/**
 * その時間帯に体験を担当できるコーチの人数。
 * @param cover 確定シフトの在席時間帯。**null = その日のシフトがまだ確定していない**
 * @param s,e   体験の時間帯（分）。この間ずっといる人だけ数える
 */
export function coachCapacity(cover: Span[] | null, s: number, e: number): number {
  if (cover === null) return NO_SHIFT_CAPACITY;
  return cover.filter((c) => c.s <= s && c.e >= e).length;
}

/** その時間帯に重なっている体験の件数（すでに入っている予約は動かさない＝数えるだけ） */
export function trialsAt(trials: Span[], s: number, e: number): number {
  return trials.filter((t) => s < t.e && e > t.s).length;
}

/**
 * その時間帯にもう1件、体験を受けられるか。
 * すでに上限を超えている時間帯（先に入っていた予約）は増やさないだけで、消しはしない。
 */
export function canTakeTrial(cover: Span[] | null, trials: Span[], s: number, e: number): boolean {
  return trialsAt(trials, s, e) < coachCapacity(cover, s, e);
}
