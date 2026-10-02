/** 表示フォーマット（画面と印刷で同じ見た目にするため1か所に置く） */

export function dateJa(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(`${d}T00:00:00+09:00`);
  return dt.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export function dateShort(d: string | null | undefined): string {
  if (!d) return "—";
  return d.replace(/-/g, "/");
}

export function yen(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toLocaleString("ja-JP")}円`;
}

/** timestamptz → JSTの「HH:mm」 */
export function timeJst(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 円。記号なしのカンマ区切り（帳票の金額欄用） */
export function yenPlain(n: number | null | undefined): string {
  if (n == null) return "";
  return n.toLocaleString("ja-JP");
}

/** 掛け率 → 「20%OFF」表示。1.0 は「—」 */
export function offLabel(rate: number | null | undefined): string {
  if (rate == null) return "—";
  const off = Math.round((1 - rate) * 1000) / 10;
  return off === 0 ? "—" : `${off}%OFF`;
}

/** 目標の範囲を「250〜255」の形に。片方だけでも出す */
export function range(
  min: number | string | null | undefined,
  max: number | string | null | undefined,
  unit = ""
): string {
  const a = min === null || min === undefined || min === "" ? "" : String(min);
  const b = max === null || max === undefined || max === "" ? "" : String(max);
  if (!a && !b) return "";
  if (a && b) return a === b ? `${a}${unit}` : `${a} 〜 ${b}${unit}`;
  return `${a || b}${unit}`;
}

/**
 * 備考・MEMO の文字を「ふつうの文字」と「赤字にする文字」に分ける。
 *
 * 「＊…＊」で囲んだところが赤字（#331・2026-10-02 ユーザー指摘
 * 「マイナスや振り込み口座を書くときに赤字にしたい」）。
 * 日本語入力だと全角の「＊」になりがちなので、半角・全角どちらでも効かせる。
 * 閉じ忘れた「＊」はそのまま文字として出す（勝手に全部赤くしない）。
 */
export function splitRedMarks(text: string | null | undefined): { text: string; red: boolean }[] {
  const src = String(text ?? "");
  if (src === "") return [];
  if (!src.includes("*") && !src.includes("＊")) return [{ text: src, red: false }];
  // split に丸かっこ1組を渡すと [ふつう, 囲み, ふつう, 囲み, …] の順で返る。
  // 「＊で始まって＊で終わるか」で判定すると、囲みに見えるだけの文字
  // （閉じ忘れて丸ごと＊…＊に見える備考）まで赤くなるので、必ず位置で判定する。
  return src
    .split(/([*＊][^*＊\n]+[*＊])/g)
    .map((part, i) => (i % 2 === 1 ? { text: part.slice(1, -1), red: true } : { text: part, red: false }))
    .filter((p) => p.text !== "");
}
