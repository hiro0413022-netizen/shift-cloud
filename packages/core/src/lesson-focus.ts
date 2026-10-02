/**
 * レッスンノートの「今の課題」（#332・2026-10-02 ユーザー依頼）
 *
 * ★ 何のための枠か
 *   「過去のレッスン記録をさかのぼらなくても、いま取り組んでいる課題や練習のポイントを
 *    すぐ確認できるようにしたい」。レッスンごとの記録（lsn_lesson_notes）とは別に、
 *    生徒1人に1つだけ持つ。次回以降もそのまま出る。
 *
 * ★ goal（目標）とは別物
 *   goal は「いつも90台で回りたい」のような長期の目標（1行・300字）。
 *   focus は「いま何を意識して練習するか」で、複数行・入れ替わるもの。混ぜない。
 *
 * ★ お客様にもそのまま出る文字なので、ここで形だけ整える（中身は書き換えない）。
 */

/** 保存できる長さ。①〜③を3〜5行ぶん書いても余る量 */
export const FOCUS_MAX = 1200;

/** 1つの課題の最大行数。これを超える行は捨てずに残し、画面側で折り返す */
export const FOCUS_MAX_LINES = 20;

/** 未入力のときに画面へ出す文言（ユーザー指定・そのまま出す） */
export const FOCUS_EMPTY_MESSAGE = "現在の課題はまだ登録されていません";

/**
 * 保存する形に整える。
 *   ・改行は LF に寄せる（Windowsのメモ帳から貼ると CRLF で入る）
 *   ・各行の行末の空白を落とす
 *   ・空行が3つ以上続いたら2つまでに詰める（貼り付けで間延びするのを防ぐ）
 *   ・前後の空行を落とす
 *   ・FOCUS_MAX で切る（行の途中で切れてもよい。黙って全部消さない）
 * 中身が空なら null（＝未登録）。
 */
export function normalizeFocus(input: string | null | undefined): string | null {
  const raw = String(input ?? "").replace(/\r\n?/g, "\n");
  const lines = raw.split("\n").map((l) => l.replace(/[ \t　]+$/g, ""));
  const out: string[] = [];
  let blanks = 0;
  for (const l of lines) {
    if (l.trim() === "") {
      blanks += 1;
      if (blanks > 1) continue; // 空行は1つまで
      out.push("");
    } else {
      blanks = 0;
      out.push(l);
    }
  }
  const text = out.join("\n").replace(/^\n+/, "").replace(/\n+$/, "").slice(0, FOCUS_MAX);
  return text.trim() === "" ? null : text;
}

/** 画面に出す行（空行は落とす）。1行＝1つの課題として並べる */
export function focusLines(input: string | null | undefined): string[] {
  const t = normalizeFocus(input);
  if (!t) return [];
  return t.split("\n").map((l) => l.trim()).filter((l) => l !== "");
}

/** 課題が何件あるか（一覧やバッジ用） */
export function focusCount(input: string | null | undefined): number {
  return focusLines(input).length;
}

/** 登録されているか */
export function hasFocus(input: string | null | undefined): boolean {
  return normalizeFocus(input) !== null;
}

/**
 * 最終更新日の表示（JSTの暦日）。
 * 日付だけ出す＝「いつの課題か」が分かれば十分で、時刻まで出すと紙面がうるさい。
 */
export function focusUpdatedLabel(iso: string | null | undefined): string {
  const s = String(iso ?? "").trim();
  if (!s) return "";
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 9 * 3600_000);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}
