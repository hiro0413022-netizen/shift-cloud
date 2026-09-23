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

/** その時間帯に重なっている「コーチの用事」の件数（すでに入っている予約は動かさない＝数えるだけ）。
 *
 *  ★ 2026-09-21 ユーザー指摘「スタッフが1人のときに体験とパーソナルレッスンがかぶると対応できない」:
 *    体験とレッスンは同じコーチを使うのに、別々に数えていたので、コーチ1人の時間に
 *    「体験1件」と「レッスン1件」が両方通っていた（実例 2026-09-23）。
 *    渡す配列を **体験＋レッスンの合算** にして、どちらの判定でも同じ数を見る。 */
export function trialsAt(busy: Span[], s: number, e: number): number {
  return busy.filter((t) => s < t.e && e > t.s).length;
}

/**
 * その時間帯にもう1件、体験を受けられるか。
 * すでに上限を超えている時間帯（先に入っていた予約）は増やさないだけで、消しはしない。
 *
 * @param busy 体験 **と** パーソナルレッスンの時間帯（合算）。どちらも同じコーチを使う。
 */
export function canTakeTrial(cover: Span[] | null, busy: Span[], s: number, e: number): boolean {
  return trialsAt(busy, s, e) < coachCapacity(cover, s, e);
}

/**
 * 打席の予約時間の中で、指定のレッスン時間ぶん一緒にいられるコーチだけ残す（#213）
 *
 * 会員ページからコーチを指名できるようにしたので、**出勤していない人が選べてはいけない**。
 * 打席が2時間でも、レッスンは25分なので「予約時間の全部にいる」までは求めない。
 * 25分ぶん重なっていれば指名できる（何時から教えるかは店舗が決める）。
 */
export function overlapMinutes(a: Span, s: number, e: number): number {
  return Math.max(0, Math.min(a.e, e) - Math.max(a.s, s));
}

export function coachesForLesson<T extends Span>(coaches: T[], s: number, e: number, lessonMinutes: number): T[] {
  const need = Math.max(1, lessonMinutes);
  return coaches.filter((c) => overlapMinutes(c, s, e) >= need);
}


/**
 * パーソナルレッスン（25分）を、その時間にもう1件受けられるか（#225）
 *
 * ユーザー依頼「パーソナル シフト変動制 予約件数上限」＝**上限をシフトのコーチ人数に連動**させる。
 * 体験（#212）と同じ考え方:
 *   ・受入数 = その時間に25分ぶん一緒にいられるコーチの人数
 *   ・使用数 = 同じ時間に重なっている**レッスン付きの打席予約＋体験**（2026-09-21・合算にした）
 *
 * ★ 「おまかせ」も数える。指名なしの申込を数えないと、
 *   コーチ1人の時間に「おまかせ」が3件たまり、店頭で2件断ることになる。
 * ★ まだ確定していない予約は、レッスンの開始時刻が決まっていない（店舗が後で決める）。
 *   なので**打席の予約時間まるごと**を占有として扱う——これが実際に取り合いになる単位。
 * ★ シフト未確定の日は体験と同じ2件まで（NO_SHIFT_CAPACITY）。
 *   0にすると、シフトを組む前の申込が全部止まる。
 */
export function lessonCapacity(coaches: Span[] | null, s: number, e: number, lessonMinutes: number): number {
  if (coaches === null) return NO_SHIFT_CAPACITY;
  return coachesForLesson(coaches, s, e, lessonMinutes).length;
}

/** @param taken レッスン付きの打席予約 **と** 体験の時間帯（合算・2026-09-21） */
export function canTakeLesson(
  coaches: Span[] | null,
  taken: Span[],
  s: number,
  e: number,
  lessonMinutes: number,
): boolean {
  return trialsAt(taken, s, e) < lessonCapacity(coaches, s, e, lessonMinutes);
}
