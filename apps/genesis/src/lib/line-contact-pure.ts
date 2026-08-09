/**
 * LINE個人連絡先（gn_line_contacts / #121）の純粋部。
 * ネットワーク・DBに触らないロジックだけをここに置く（#113の教訓）。
 */

/**
 * 期待連絡先の自動リンク判定。
 * match_hint はカンマ区切り（例: '小川,うらら,ウララ,urara,ogawa'）。
 * LINE表示名にどれか1つでも含まれていれば true（大文字小文字は無視）。
 */
export function matchesContactHint(displayName: string | null | undefined, matchHint: string | null | undefined): boolean {
  const name = String(displayName ?? "").toLowerCase();
  if (!name) return false;
  return String(matchHint ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .some((h) => name.includes(h));
}

/** Inboxに出す差出人名: 正式名（person_name）> LINE表示名 > null */
export function contactFromName(personName: string | null | undefined, displayName: string | null | undefined): string | null {
  const p = String(personName ?? "").trim();
  if (p) return p;
  const d = String(displayName ?? "").trim();
  return d || null;
}
