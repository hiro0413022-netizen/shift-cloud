/**
 * 一時利用顧客名簿（Excel出力）の表示書式（#173・2026-08-28 ユーザー依頼）
 *
 * ★ なぜ純関数で切り出すか
 *   「日付はスラッシュ」「電話はハイフン区切り」は見た目の話に見えて、**出した名簿をそのまま
 *   取り込み直す**（import/actions.ts）運用があるので、書式を変えると往復が壊れうる。
 *   ここに集約してテストで固定しておく。
 */

/**
 * 日付は「2026/08/28」で出す。
 * DBの date 列は "YYYY-MM-DD" で返るので区切りを差し替えるだけ。
 * 取込側の cellDate は "/" 区切りも受けるので、出した名簿はそのまま戻せる。
 * 日付として読めないもの（空・自由記述）は原文のまま返す。
 */
export function ymdSlash(v: unknown): string {
  const t = v == null ? "" : String(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : t;
}

/**
 * 電話番号は「090-1234-5678」の形で出す。
 *
 * 名簿の実データ（mbr_guests 約6,200件）は **5,684件が既に正しいハイフン区切り**で、
 * 崩れているのは数十件だけ（数字だけ11桁・全角ハイフン・スペース区切り・+81始まり・
 * ハイフン位置ちがい）。さらに「090-4300-5336（母弘子様携帯」「06-6777-3679・090-711…」の
 * ように**メモや2件目が書き込まれている行**がある。数字だけ抜いて組み直すとその情報が消える。
 *
 * なので「確実に直せるものだけ直す」:
 *   ① 記号ゆれを寄せると妥当なハイフン区切りになる → それを出す
 *   ② 電話番号の文字しか含まない かつ 携帯/IP(11桁)・0120/0800/0570・03/06 → 整形する
 *   ③ それ以外（メモ書き付き／桁数が合わない／市外局番の切れ目が判らない固定電話）→ **原文のまま**
 *
 * 固定電話の市外局番は1〜4桁で、表がないと切れ目を決められない（0797-81-xxxx と 079-781-xxxx は
 * どちらも10桁）。当てずっぽうに割ると、正しかった番号を壊す方が多くなるのでやらない。
 */
export function formatTel(v: unknown): string {
  const raw = v == null ? "" : String(v).trim();
  if (!raw) return "";

  // 全角英数→半角、ハイフンに見える記号を半角ハイフンへ、空白は詰める
  const norm = raw
    .normalize("NFKC")
    .replace(/[‐‑‒–—―ー−]/g, "-")
    .replace(/[\s\u3000]+/g, "");
  if (/^0\d{1,4}-\d{1,4}-\d{3,4}$/.test(norm)) return norm; // ①

  // 電話番号以外の文字が混ざっていたら触らない（メモ書き・2件併記など）
  if (!/^[0-9+()-]+$/.test(norm)) return raw;

  const digits = norm.replace(/^\+81/, "0").replace(/[^0-9]/g, "");
  if (digits.length === 11 && digits.startsWith("0")) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    if (/^(0120|0800|0570)/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
    if (/^0[36]/.test(digits)) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return raw; // ③
}
