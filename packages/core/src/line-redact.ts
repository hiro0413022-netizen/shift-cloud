/* ============================================================
   LINEに出さないスタッフ名の伏せ字（DECISIONS #243）

   背景（2026-09-15 ユーザー指示）: 「藤田プロの名前はLINEに一切出さない」。
   朝の出勤連絡・スタッフへ連絡・JARVIS経由の送信など、公式LINEへ出る文面は
   すべてここを通す。誰を伏せるかは staff.line_hidden（migration 0183）で持ち、
   コードに名前は書かない。

   どこまで伏せるか:
     - 氏名そのもの（全角/半角スペースあり・なし）
     - 姓＋敬称（プロ／コーチ／さん／先生／様／氏／くん／君）
     - 姓だけ・名だけ（2文字以上のとき）
   置き換えは「担当プロ」。行ごと消すのではなく語だけ差し替える＝
   文の意味（「◯◯が対応します」）は残す。

   純粋関数。テストは tests/line-redact.test.ts。
   ============================================================ */

export const LINE_REDACT_PLACEHOLDER = "担当プロ";

const HONORIFICS = ["プロ", "コーチ", "さん", "先生", "様", "氏", "くん", "君"];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 「藤田　晃規」→ 姓・名に分ける（区切りは全角/半角スペース。区切りが無ければ姓のみ） */
export function splitName(name: string): { sei: string; mei: string | null } {
  const parts = name
    .replace(/[　\s]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (parts.length === 0) return { sei: "", mei: null };
  return { sei: parts[0], mei: parts.length > 1 ? parts.slice(1).join("") : null };
}

/** 1人ぶんの表記ゆれ（長いものから順＝先に長い一致を潰す） */
export function nameVariants(name: string): string[] {
  const { sei, mei } = splitName(name);
  if (!sei) return [];
  const out = new Set<string>();
  if (mei) {
    out.add(`${sei}　${mei}`);
    out.add(`${sei} ${mei}`);
    out.add(`${sei}${mei}`);
  }
  for (const h of HONORIFICS) out.add(`${sei}${h}`);
  if (sei.length >= 2) out.add(sei);
  if (mei && mei.length >= 2) out.add(mei);
  return Array.from(out).sort((a, b) => b.length - a.length);
}

/** 文面から伏せるべき名前を置き換える。names が空なら何もしない */
export function redactNames(text: string, names: readonly string[], placeholder = LINE_REDACT_PLACEHOLDER): string {
  if (!text || names.length === 0) return text;
  const variants = names
    .flatMap((n) => nameVariants(n))
    .sort((a, b) => b.length - a.length);
  if (variants.length === 0) return text;
  const re = new RegExp(variants.map(escapeRe).join("|"), "g");
  return text.replace(re, placeholder);
}

/** 文面にまだ名前が残っていないか（送信直前の最後の砦・テスト用） */
export function containsHiddenName(text: string, names: readonly string[]): boolean {
  return names.some((n) => nameVariants(n).some((v) => text.includes(v)));
}
