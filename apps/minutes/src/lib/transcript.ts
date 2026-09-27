/**
 * 文字起こしの扱い（純粋関数・テスト tests/minutes-transcript.test.ts）
 *
 * 1行の形: "[01:02:03] 話者A: 発言"
 *   録音は10分ごとの区間に分けて文字起こしする（区間ごとに独立した音声ファイル）。
 *   AIが返す時刻は区間の頭からの相対時刻なので、区間の開始秒を足して会議全体の時刻に直す。
 *
 * 根拠の照合（verifyQuote）:
 *   要約の各項目にはAIに「根拠の発言」を原文で付けさせている。
 *   AIが言い換えた文や作った文を根拠として出してくることがあるので、
 *   **文字起こしに本当にあるかをサーバー側で確かめて**、無いものは画面で目立たせる。
 */
import type { Item, QuoteCheck, Summary, Todo } from "./modes";

const LINE = /^\s*\[(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\]\s*(.*)$/;

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** 区間の相対時刻 → 会議全体の時刻。時刻の無い行はそのまま */
export function offsetTranscript(text: string, offsetSec: number): string {
  return text
    .split("\n")
    .map((line) => {
      const m = LINE.exec(line);
      if (!m) return line;
      const sec = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      return `[${fmtTime(sec + offsetSec)}] ${m[4]}`;
    })
    .join("\n");
}

/** 区間を順番につなぐ（欠けている区間があれば、欠けていると明記する＝黙ってつながない） */
export function joinSegments(segs: { idx: number; transcript: string | null; offsetSec: number }[]): string {
  const sorted = [...segs].sort((a, b) => a.idx - b.idx);
  return sorted
    .map((s) =>
      s.transcript?.trim()
        ? offsetTranscript(s.transcript.trim(), s.offsetSec)
        : `[${fmtTime(s.offsetSec)}] （この区間は文字起こしできませんでした）`
    )
    .join("\n");
}

const SPEAKER = /^\s*(?:\[[\d:]+\]\s*)?([^:：\n]{1,20})[:：]/;

/** 文字起こしに出てくる話者ラベル（出現順・重複なし） */
export function listSpeakers(text: string): string[] {
  const seen: string[] = [];
  for (const line of text.split("\n")) {
    const m = SPEAKER.exec(line);
    if (!m) continue;
    const name = m[1].trim();
    if (name && !seen.includes(name)) seen.push(name);
    if (seen.length >= 20) break;
  }
  return seen;
}

/** 話者ラベルを実名に置き換える（行頭のラベルだけ。本文中の同じ文字列は触らない） */
export function applySpeakers(text: string, map: Record<string, string>): string {
  const entries = Object.entries(map).filter(([k, v]) => k && v && v.trim() && k !== v.trim());
  if (!entries.length) return text;
  return text
    .split("\n")
    .map((line) => {
      const m = /^(\s*(?:\[[\d:]+\]\s*)?)([^:：\n]{1,20})([:：])/.exec(line);
      if (!m) return line;
      const hit = entries.find(([k]) => k === m[2].trim());
      return hit ? `${m[1]}${hit[1].trim()}${m[3]}${line.slice(m[0].length)}` : line;
    })
    .join("\n");
}

/** 照合用の正規化: 全角半角・時刻・話者ラベル・空白・句読点・記号を落とす */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:\[[\d:]+\]\s*)?[^:：\n]{1,20}[:：]/, ""))
    .join("")
    .toLowerCase()
    .replace(/[\s、。，．,.!！?？「」『』（）()【】・…ー―\-〜~"'”“’‘:：;；]/g, "");
}

/**
 * 根拠の発言が文字起こしにあるか。
 *   ok   = 正規化後にそのまま含まれる
 *   near = 6文字ずつ区切ったかけらの6割以上が含まれる（言い回しが少し違う・聞き取りの揺れ）
 *   none = それ以外（AIが作った文の疑い）
 * normTranscript は normalizeForMatch 済みのものを渡す（何十回も正規化しないため）。
 */
export function verifyQuote(quote: string, normTranscript: string): QuoteCheck {
  const q = normalizeForMatch(quote);
  if (q.length < 4) return "none";
  if (normTranscript.includes(q)) return "ok";
  const n = 6;
  if (q.length < n) return "none";
  let total = 0;
  let hit = 0;
  for (let i = 0; i + n <= q.length; i += n) {
    total += 1;
    if (normTranscript.includes(q.slice(i, i + n))) hit += 1;
  }
  return total && hit / total >= 0.6 ? "near" : "none";
}

/** 要約の全項目に照合結果を付ける */
export function annotateSummary(s: Summary, transcript: string): Summary {
  const norm = normalizeForMatch(transcript);
  const it = (xs: Item[]) => xs.map((x) => ({ ...x, check: verifyQuote(x.q, norm) }));
  const td = (xs: Todo[]) => xs.map((x) => ({ ...x, check: verifyQuote(x.q, norm) }));
  const sections: Record<string, Item[]> = {};
  for (const [k, v] of Object.entries(s.sections)) sections[k] = it(v);
  return { ...s, decisions: it(s.decisions), open: it(s.open), todos: td(s.todos), sections };
}

/** 照合で見つからなかった件数（画面の注意書きに使う） */
export function countUnverified(s: Summary): number {
  const all = [...s.decisions, ...s.open, ...s.todos, ...Object.values(s.sections).flat()];
  return all.filter((x) => x.check === "none").length;
}

/**
 * AIが同じ行を延々と繰り返したとき（出力上限で切れる原因）に畳む。
 * lesson-os の collapseRepeats と同じ考え方。3回目以降を捨てて1行だけ注記する。
 */
export function collapseRepeats(text: string): string {
  const out: string[] = [];
  let run = 0;
  let prevBody = "";
  for (const line of text.split("\n")) {
    const body = line.replace(/^\s*\[[\d:]+\]\s*/, "").trim();
    if (body && body === prevBody) {
      run += 1;
      if (run === 2) out.push("（同じ言葉の繰り返しを省略）");
      if (run >= 2) continue;
    } else {
      run = 0;
    }
    prevBody = body;
    out.push(line);
  }
  return out.join("\n");
}
