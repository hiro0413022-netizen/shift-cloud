// 会員証トークンの「形」だけを置く（#162 で frank-portal.ts から切り出した）。
//
// なぜ分けたか:
//   frank-portal.ts は node:crypto を読む＝ブラウザに持ち込めない。
//   受付チェックイン画面の診断表示（?debug=1）は、読み取った文字列が
//   「会員証QRの形かどうか」をその場で判定して出したい＝クライアント側で使う。
//   文字集合を画面側にコピーすると、片方だけ直したときに黙って食い違うので、
//   node に依存しない部分だけをこのファイルに移し、frank-portal.ts はここから読む。
//
// 正典: docs/modules/frank/MEMBER_PORTAL_構想.md

/**
 * 使う文字は 数字＋英大文字のみ、さらに 0/O・1/I/L を除いた31文字。
 *
 * なぜ記号と小文字を使わないか:
 *   受付のバーコードリーダー(Tera 9200)は USB HIDキーボードとして文字を「打つ」。
 *   既定はUS配列なので、日本語配列のPCに繋ぐと記号が化ける（- / _ \ など）。
 *   数字＋英大文字だけなら配列設定が何であっても化けない。
 *   仮想COM(シリアル)に切り替えても同じく安全なので、後から切り替えても影響しない。
 * なぜ 0/O・1/I/L を抜くか:
 *   スタッフが画面の文字を読んで手入力する場面（リーダー故障時）で誤りやすいため。
 */
export const CHECKIN_TOKEN_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CHECKIN_TOKEN_LENGTH = 16;

export const CHECKIN_TOKEN_RE = new RegExp(`^[${CHECKIN_TOKEN_ALPHABET}]{${CHECKIN_TOKEN_LENGTH}}$`);

/** 会員証トークンの形をしているか（中身が実在するかは見ない）。 */
export function isCheckinTokenShape(s: string): boolean {
  return CHECKIN_TOKEN_RE.test(s);
}
