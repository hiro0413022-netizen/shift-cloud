// 店頭タブレット「2回目以降の方」の検索まわり（純ロジック・テストはここに書く）
//
// DB側（0150 search_reception_guests）は氏名・カナ・電話下4桁・前回来店日・来店回数しか返さない。
// 画面もそれ以上は出さない ── お客様のタブレットは誰でも触れるので、
// 名前を打っただけで他人の住所や生年月日が読める状態を作らない（DECISIONS #226）。

export type ReceptionCandidate = {
  id: string;
  name: string;
  name_kana: string | null;
  /** 電話番号の下4桁。同姓同名をご自身で見分けていただくためだけに出す */
  phone_tail: string | null;
  visit_count: number;
  last_visit: string | null;
};

/**
 * 検索語の正規化。ひらがな→カタカナ、空白・中黒を除去。
 * DB側 app.kana(0150) と同じ規則をブラウザ側にも置く。
 * ここでは「2文字以上かどうか」を判定するためだけに使い、
 * 送るのは正規化前の文字列（正規化の正典はDB側1か所）。
 */
export function normalizeQuery(q: string | null | undefined): string {
  return String(q ?? "")
    .replace(/[\s　・.]/g, "")
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** 1文字では引かない（名簿がずらりと並ぶのを防ぐ） */
export function isSearchable(q: string | null | undefined): boolean {
  return normalizeQuery(q).length >= 2;
}

/** 下4桁を伏せ字つきで見せる（例: 5678 → ****5678） */
export function maskedPhone(tail: string | null | undefined): string | null {
  const t = String(tail ?? "").replace(/[^0-9]/g, "");
  return t.length === 4 ? `****${t}` : null;
}

/** 2026-07-03 → 2026/7/3（前回来店日の表示） */
export function fmtVisitDay(d: string | null | undefined): string | null {
  const m = String(d ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}/${Number(m[2])}/${Number(m[3])}` : null;
}

/** 候補カードの2行目（前回来店日・来店回数・下4桁を1行に） */
export function candidateHint(c: ReceptionCandidate): string {
  const parts: string[] = [];
  const last = fmtVisitDay(c.last_visit);
  if (last) parts.push(`前回 ${last}`);
  if (c.visit_count > 0) parts.push(`${c.visit_count}回目のご来店`);
  const phone = maskedPhone(c.phone_tail);
  if (phone) parts.push(`電話 ${phone}`);
  return parts.join("　/　");
}

/** DB関数の生JSON → 候補の配列（形が違う行は落とす） */
export function readCandidates(raw: unknown): ReceptionCandidate[] {
  if (!Array.isArray(raw)) return [];
  const out: ReceptionCandidate[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const id = typeof r?.id === "string" ? r.id : "";
    const name = typeof r?.name === "string" ? r.name.trim() : "";
    if (!id || !name) continue;
    out.push({
      id,
      name,
      name_kana: typeof r.name_kana === "string" && r.name_kana.trim() ? r.name_kana.trim() : null,
      phone_tail: typeof r.phone_tail === "string" && r.phone_tail ? r.phone_tail : null,
      visit_count: Number(r.visit_count ?? 0) || 0,
      last_visit: typeof r.last_visit === "string" && r.last_visit ? r.last_visit.slice(0, 10) : null,
    });
  }
  return out;
}
