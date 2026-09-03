/**
 * 日本の電話番号の検証（#208・純関数）
 *
 * きっかけ（2026-09-03 実障害）:
 *   Web入会で電話番号が「0905655867」（携帯なのに10桁＝1桁足りない）で送られ、
 *   Square が決済リンクの発行そのものを "Invalid phone number." で拒否した。
 *   決済リンクが作れなかった申込は「承認待ち」画面に落ちるため、
 *   **お客様には成功したように見えて、決済ページには一生たどり着かない**。
 *
 * だから電話番号の判定はここ1か所に置き、**画面とサーバーの両方が同じ関数を通す**
 * （生年月日 birth-date.ts と同じ考え方・#190）。
 *
 * 桁数の規則（国内表記・先頭0）:
 *   - 携帯 / IP電話（070・080・090・050）… 11桁
 *   - M2M（020）……………………………… 11桁
 *   - フリーダイヤル 0120 ………………… 10桁 ／ 0800 … 11桁
 *   - 固定電話（上記以外の 0X）…………… 10桁
 * ハイフン・空白・全角数字・国番号(+81)は受け取って正規化する。
 */

/** 全角数字・全角記号→半角。お客様のスマホ入力で混ざることがある */
function toHalfWidthDigits(s: string): string {
  return s
    .replace(/[\uff10-\uff19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\uff0b/g, "+")
    .replace(/[\uff0d\u2010\u2011\u2012\u2013\u2014\u2015\u30fc\u2212]/g, "-");
}

/**
 * 入力を「国内表記の数字だけ」に直す（+81 / 81 始まりは 0 始まりへ）。
 * 判定できない入力でも、とりあえず数字列は返す（理由づけは jpPhoneError が行う）。
 */
export function normalizeJpPhone(value: unknown): string {
  const raw = toHalfWidthDigits(String(value ?? "").trim());
  let digits = raw.replace(/\D/g, "");
  // +81 90 1234 5678 / 81901234567 → 0 始まりへ。"0081..." のような国際プレフィクスも拾う
  if (digits.startsWith("0081")) digits = digits.slice(4);
  else if (raw.startsWith("+") && digits.startsWith("81")) digits = digits.slice(2);
  else if (!digits.startsWith("0") && digits.startsWith("81")) digits = digits.slice(2);
  if (!digits.startsWith("0") && digits.length >= 9) digits = `0${digits}`;
  return digits;
}

/** その番号が国内番号として何桁であるべきか。判定できなければ null */
function expectedLength(digits: string): number | null {
  if (!digits.startsWith("0")) return null;
  if (digits.startsWith("0120")) return 10;
  if (digits.startsWith("0800")) return 11;
  const head3 = digits.slice(0, 3);
  if (["070", "080", "090", "050", "020"].includes(head3)) return 11;
  if (digits.startsWith("00")) return null; // 国際発信プレフィクスなど＝国内の連絡先ではない
  return 10; // 固定電話
}

/** 携帯・IP電話（お客様の連絡先として一番多い）か */
export function isJpMobile(value: unknown): boolean {
  const d = normalizeJpPhone(value);
  return ["070", "080", "090", "050"].includes(d.slice(0, 3)) && d.length === 11;
}

/**
 * 電話番号を検査して、問題があればお客様に出す日本語の理由を返す（問題なければ null）。
 * 桁数を「何桁であるべきか」まで書いて返す＝お客様が自分で直せる（アラートは直せるまで作る）。
 */
export function jpPhoneError(value: unknown): string | null {
  const raw = toHalfWidthDigits(String(value ?? "").trim());
  if (raw === "") return "電話番号をご入力ください";
  if (/[^0-9+\-() 　]/.test(raw)) return "電話番号は数字とハイフンでご入力ください";

  const digits = normalizeJpPhone(raw);
  if (!digits.startsWith("0")) return "電話番号は0から始まる国内の番号をご入力ください";

  const want = expectedLength(digits);
  if (want === null) return "電話番号をご確認ください";
  if (digits.length === want) return null;

  const head3 = digits.slice(0, 3);
  if (["070", "080", "090"].includes(head3)) {
    return `携帯電話の番号は11桁です（入力は${digits.length}桁です）。例 090-1234-5678`;
  }
  if (head3 === "050") {
    return `IP電話の番号は11桁です（入力は${digits.length}桁です）。例 050-1234-5678`;
  }
  return `固定電話の番号は10桁です（入力は${digits.length}桁です）。例 079-123-4567`;
}

/**
 * Square など外部サービスに渡せる E.164（+81…）。**検査を通ったときだけ返す。**
 * ⚠ 怪しい番号で null を返すのがこの関数の仕事。呼び出し側は null を
 *   「渡さない」で済ませること（渡すと決済リンクの発行ごと失敗する・上の実障害）。
 */
export function toE164Jp(value: unknown): string | null {
  if (jpPhoneError(value) !== null) return null;
  return `+81${normalizeJpPhone(value).slice(1)}`;
}
