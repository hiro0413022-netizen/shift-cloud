/**
 * LINE公式アカウントの「トーク履歴CSV」を読む（依存なし・純関数 / サーバー・クライアント両用）
 *
 * 形式（2026-09 時点の LINE Official Account Manager のエクスポート）:
 *   アカウント名,RaRaLESSON 会員様専用
 *   タイムゾーン,'+09:00
 *   ダウンロード日時,2026/09/15 14:34
 *   送信者タイプ,送信者名,送信日,送信時刻,内容
 *   User,☆辻子　曜(レギュラー),2025/09/18,14:24:55,辻子　曜です。
 *   Account,RaRa,2025/09/19,08:06:14,"複数行の
 *   本文"
 *
 * - 本文は改行を含むので、行ではなく CSV として読む（RFC4180 のクォート）。
 * - 同じCSVを何度取り込んでも二重にならないよう、行ごとに決まった fingerprint を付ける。
 *   同じ秒に同じ本文が複数ある（動画を2本続けて送った等）ので、出現順の番号も混ぜる。
 */

export type Direction = "in" | "out" | "system";
export type MessageKind = "text" | "video" | "photo" | "sticker" | "unsent" | "system";
export type PlanKey = "regular" | "premium" | "other";

export type ParsedMessage = {
  direction: Direction;
  kind: MessageKind;
  sender: string;
  body: string;
  sentAt: string; // ISO8601（タイムゾーン付き）
  fingerprint: string;
};

export type ParsedMember = {
  name: string;
  nameKey: string;
  lineName: string | null;
  plan: PlanKey;
  mark: string | null;
};

export type ParsedExport = {
  accountName: string | null;
  member: ParsedMember | null;
  messages: ParsedMessage[];
  /** 読めなかった行数（形式が違う行） */
  skipped: number;
};

/** RFC4180 準拠の最小CSVパーサ（BOM・CRLF・クォート内改行・"" エスケープ対応） */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** 32bit FNV-1a（決定的な指紋。暗号用途ではない） */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const PLAN_WORDS: [RegExp, PlanKey][] = [
  [/プレミアム|premium/i, "premium"],
  [/レギュラー|regular/i, "regular"],
];

/** 名前の頭につける印（☆ ⚠️ ★ ◎ など）。本人の運用メモなので捨てずに残す */
const MARK_RE = /^[\s☆★◎○●◆◇♡♥❤⚠️⚠️✨💎🔥⭐]+/u;

/** 照合用のキー: 空白・記号・プラン表記を除く（全角半角もそろえる） */
export function nameKeyOf(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[（(][^）)]*[)）]/g, "")
    .replace(/レギュラー|プレミアム/g, "")
    .replace(MARK_RE, "")
    .replace(/[\s　・.,、。_\-]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

/**
 * LINEの表示名から会員情報を取り出す。
 *   "☆辻子　曜(レギュラー)" → { name:"辻子 曜", plan:"regular", mark:"☆" }
 *   "⚠️村居 尚樹(レギュラー)" → { name:"村居 尚樹", plan:"regular", mark:"⚠️" }
 */
export function parseLineName(raw: string): ParsedMember {
  const lineName = raw.trim();
  let rest = lineName;
  const markMatch = rest.match(MARK_RE);
  const mark = markMatch ? markMatch[0].trim() || null : null;
  if (markMatch) rest = rest.slice(markMatch[0].length);

  let plan: PlanKey = "other";
  const paren = rest.match(/[（(]([^）)]*)[)）]\s*$/);
  const planSource = paren ? paren[1] : rest;
  for (const [re, key] of PLAN_WORDS) {
    if (re.test(planSource)) {
      plan = key;
      break;
    }
  }
  if (paren) rest = rest.slice(0, paren.index);
  else rest = rest.replace(/レギュラー|プレミアム/g, "");

  const name = rest.replace(/　/g, " ").replace(/\s+/g, " ").trim();
  return { name, nameKey: nameKeyOf(name), lineName: lineName || null, plan, mark };
}

/**
 * ファイル名からの推定（CSVの中に会員の発言が1件も無いときの保険）
 *   "20250509_20260914_⚠️村居 尚樹レギュラー.csv" → 村居 尚樹 / regular
 */
export function parseFileName(fileName: string): ParsedMember | null {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.csv$/i, "");
  const m = base.match(/^\d{8}_\d{8}_(.+)$/);
  const body = (m ? m[1] : base).trim();
  if (!body) return null;
  const plan: PlanKey = /プレミアム/.test(body) ? "premium" : /レギュラー/.test(body) ? "regular" : "other";
  const p = parseLineName(body.replace(/(レギュラー|プレミアム)$/, ""));
  return { ...p, plan, lineName: null };
}

const SYSTEM_BODIES: [RegExp, MessageKind][] = [
  [/^動画を送信しました。?$/, "video"],
  [/^写真を送信しました。?$/, "photo"],
  [/^スタンプを送信しました。?$/, "sticker"],
  [/^送信が取り消されたメッセージです$/, "unsent"],
];

export function kindOf(body: string): MessageKind {
  const t = body.trim();
  for (const [re, k] of SYSTEM_BODIES) if (re.test(t)) return k;
  return "text";
}

/** "'+09:00" → "+09:00"（読めなければ日本時間） */
function tzOf(v: string | undefined): string {
  const m = (v ?? "").match(/([+-])(\d{1,2}):?(\d{2})/);
  if (!m) return "+09:00";
  return `${m[1]}${m[2].padStart(2, "0")}:${m[3]}`;
}

function isoOf(date: string, time: string, tz: string): string | null {
  const d = date.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  const t = time.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!d || !t) return null;
  const p = (n: string) => n.padStart(2, "0");
  return `${d[1]}-${p(d[2])}-${p(d[3])}T${p(t[1])}:${t[2]}:${t[3] ?? "00"}${tz}`;
}

/**
 * CSVの本文（1会員ぶん）を読む。
 * 本文の先頭の「'」は Excel 対策の接頭辞なので落とす。
 */
export function parseLineExport(text: string, fileName = ""): ParsedExport {
  const rows = parseCsv(text);
  let accountName: string | null = null;
  let tz = "+09:00";
  let headerAt = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const r = rows[i];
    if (r[0] === "アカウント名") accountName = (r[1] ?? "").trim() || null;
    if (r[0] === "タイムゾーン") tz = tzOf(r[1]);
    if (r[0] === "送信者タイプ") {
      headerAt = i;
      break;
    }
  }
  const body = headerAt >= 0 ? rows.slice(headerAt + 1) : rows;

  const messages: ParsedMessage[] = [];
  const seen = new Map<string, number>();
  const userNames = new Map<string, number>();
  let skipped = 0;

  for (const r of body) {
    if (r.length === 1 && r[0] === "") continue;
    if (r.length < 5) {
      skipped++;
      continue;
    }
    const type = r[0].trim();
    const sender = r[1].trim();
    const sentAt = isoOf(r[2], r[3], tz);
    if (!sentAt || (type !== "User" && type !== "Account")) {
      skipped++;
      continue;
    }
    // 内容にカンマが含まれてクォートされていない場合に備えて残りを結合
    let content = r.slice(4).join(",");
    content = content.replace(/\r\n?/g, "\n").replace(/^'\n?/, "").replace(/_x000D_/g, "").replace(/\s+$/, "");

    let direction: Direction = type === "User" ? "in" : "out";
    let kind = kindOf(content);
    if (type === "Account" && sender === "応答メッセージ") {
      direction = "system";
      kind = "system";
    }
    if (direction === "in" && sender) userNames.set(sender, (userNames.get(sender) ?? 0) + 1);

    const base = `${direction}|${sentAt}|${fnv1a(content)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    messages.push({ direction, kind, sender, body: content, sentAt, fingerprint: `${base}|${n}` });
  }

  let member: ParsedMember | null = null;
  if (userNames.size) {
    const top = [...userNames.entries()].sort((a, b) => b[1] - a[1])[0][0];
    member = parseLineName(top);
  }
  const fromFile = fileName ? parseFileName(fileName) : null;
  if (!member || !member.name) member = fromFile;
  else if (member.plan === "other" && fromFile && fromFile.plan !== "other") member = { ...member, plan: fromFile.plan };

  messages.sort((a, b) => (a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0));
  return { accountName, member, messages, skipped };
}

export type VideoRef = { url: string; title: string };

/** YouTube の URL を正規化（共有パラメータ ?si= などを落とす） */
export function normalizeYoutubeUrl(url: string): string | null {
  const u = url.trim();
  let m = u.match(/^https?:\/\/youtu\.be\/([\w-]{6,})/);
  if (m) return `https://youtu.be/${m[1]}`;
  m = u.match(/^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/)([\w-]{6,})/);
  if (m) return `https://youtu.be/${m[1]}`;
  return null;
}

/**
 * 返信文から「タイトル行＋URL」を拾う。
 *   【重要】腕のたたみ方-肘は体の前から外さない-
 *   https://youtu.be/5kBDxR35BaU
 * タイトルが無い（URLだけの行）ものはタイトル空で返す。
 */
export function extractVideos(body: string): VideoRef[] {
  const out: VideoRef[] = [];
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const found = lines[i].match(/https?:\/\/(?:youtu\.be|(?:www\.|m\.)?youtube\.com)\/\S+/);
    if (!found) continue;
    const url = normalizeYoutubeUrl(found[0]);
    if (!url) continue;
    let title = lines[i].slice(0, found.index).trim();
    for (let j = i - 1; !title && j >= 0 && j >= i - 2; j--) {
      const cand = lines[j].trim();
      if (!cand || /^[┈ー\-─=＝]+$/.test(cand)) continue;
      if (/https?:\/\//.test(cand)) break; // 直前も別の動画のURL＝タイトル無し
      title = cand;
    }
    title = title
      .replace(/^[「『（(]?(参考動画|参考)[」』）)]?[:：]?\s*/, "")
      .replace(/^[〈<（(]?参考動画[〉>）)]?\s*/, "")
      .trim();
    if (/^(この動画|こちらの動画|動画)/.test(title) || title.length > 80) title = "";
    out.push({ url, title });
  }
  return out;
}
