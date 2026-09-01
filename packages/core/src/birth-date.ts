/**
 * 生年月日の検証（#190・純関数）
 *
 * 体験予約で生年月日を必須にした（2026-09-01 ユーザー指示）。入口が2つある:
 *   ① 公式サイト frankgolf.jp/trial-booking.html（素のJS）
 *   ② スタッフが受ける member-os /trial
 * 画面のチェックだけに頼ると、画面を経由しない直接POSTで空のまま入る。
 * **同じ規則をサーバー側でも通す**ために、判定をここ1か所に置いてテストで固定する。
 *
 * 弾くのは「そもそも日付として成立しないもの」だけにする（2月31日・未来・1900年より前）。
 * 年齢での足切りはしない＝体験には未成年も来る。
 */

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 生年月日として受け付けられる最も古い年 */
export const BIRTH_MIN_YEAR = 1900;

/**
 * 生年月日を検査して、問題があればお客様に出す日本語の理由を返す（問題なければ null）。
 * `today` は「今日」の YYYY-MM-DD。渡さないと環境の日付に依存してテストが時限爆弾になる。
 */
export function birthDateError(value: unknown, today: string): string | null {
  const s = String(value ?? "").trim();
  if (s === "") return "生年月日をご入力ください";
  const m = RE.exec(s);
  if (!m) return "生年月日をご確認ください";

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < BIRTH_MIN_YEAR) return "生年月日をご確認ください";
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "生年月日をご確認ください";
  // 2月31日のような「暦に無い日」を弾く（UTCで組んで比べるだけなので時差の影響を受けない）
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return "生年月日をご確認ください";
  }
  if (s > today) return "生年月日が未来の日付になっています";
  return null;
}

/** 検査を通ったら YYYY-MM-DD を返す。通らなければ null（保存する値を作る側で使う） */
export function normalizeBirthDate(value: unknown, today: string): string | null {
  const s = String(value ?? "").trim();
  return birthDateError(s, today) === null ? s : null;
}

/** 生年月日から満年齢（受付台帳・案内の判断用。today は YYYY-MM-DD） */
export function ageOn(birthDate: string, today: string): number | null {
  if (birthDateError(birthDate, today) !== null) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}
