/**
 * お客様に見せるレッスンの中身（2026-09-03・#210）
 *
 * ここに置く理由:
 *   同じものを **2か所で描く**ようになったため。
 *     - 会員ページ（member-os `/member/lesson`）… ログインしたご本人がその場で見る
 *     - 共有ページ（lesson-os `/s/<token>`）… URLを送ってアプリなしで見てもらう
 *   項目や紐づけの規則をどちらかに書くと、必ず「会員ページには出るのに共有URLには出ない」が起きる。
 */

export type ClientField = { key: string; label: string; unit: string };

/**
 * お客様の画面に出す計測項目（2026-09-03 ユーザー選択の8つ）
 *
 * 22項目を全部並べるとお客様には読めず、その場で先生が説明する時間が要る。
 * 「今日どう変わったか」が伝わる8つに絞る。数字を隠す意図ではなく、
 * 残りは先生が計測タブで見て口頭で足す。
 *
 * ⚠ 増やすときは「お客様が一人で見て分かるか」で決める。
 */
export const CLIENT_FIELDS: ClientField[] = [
  { key: "club_speed", label: "クラブスピード", unit: "m/s" },
  { key: "ball_speed", label: "ボールスピード", unit: "m/s" },
  { key: "smash_factor", label: "ミート率", unit: "" },
  { key: "launch_angle", label: "打ち出し角", unit: "°" },
  { key: "spin_rate", label: "スピン量", unit: "rpm" },
  { key: "carry", label: "キャリー", unit: "yd" },
  { key: "club_path", label: "クラブパス", unit: "°" },
  { key: "face_angle", label: "フェースアングル", unit: "°" },
];

export const CLIENT_FIELD_KEYS: string[] = CLIENT_FIELDS.map((f) => f.key);

/**
 * その日の最後に撮ったスイング（＝会話メモの紐づけ先）を日付ごとに引けるようにする。
 * videos は**新しい順**で渡すこと（最初に見つかったものがその日の最後の1本）。
 */
export function latestVideoByDay(
  videos: Array<{ id: string; shotAt: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const v of videos) if (v.shotAt && !map.has(v.shotAt)) map.set(v.shotAt, v.id);
  return map;
}

/**
 * このメモをどのスイングの下に出すか。
 *
 * `video_id` は #201 の保存を通ったメモにしか入っていない。それ以前のメモを
 * 「動画と関係のない一覧」に落とすと、お客様には説明が動画とバラバラに見える。
 * **同じ日の最後のスイング**で拾う（過去データは書き換えない）。
 */
export function noteVideoId(
  note: { videoId: string | null; lessonDate: string },
  latestOfDay: Map<string, string>
): string | null {
  return note.videoId ?? latestOfDay.get(note.lessonDate) ?? null;
}

/** 前回との差（同じ項目・同じクラブ同士でのみ使う）。小数1桁 */
export function diffOf(now: number, before: number | undefined): number | null {
  if (typeof before !== "number") return null;
  const d = Math.round((now - before) * 10) / 10;
  return d === 0 ? null : d;
}
