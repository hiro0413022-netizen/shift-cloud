/**
 * Focus Mode / CEO Mode（#304）— cookie に入れる「いま何に絞っているか」。
 * 純関数（テストで固定）。読み書きは lib/focus.ts。
 */
export type Focus = { store: string | null; project: string | null; ceo: boolean };

export const EMPTY_FOCUS: Focus = { store: null, project: null, ceo: false };
export const FOCUS_COOKIE = "gn_focus";

/** cookie の文字列 → Focus。壊れていても落ちない・許可された店舗/案件だけ残す */
export function parseFocus(raw: string | null | undefined, allow: { stores: string[]; projects: string[]; canCeo: boolean }): Focus {
  if (!raw) return EMPTY_FOCUS;
  try {
    const j = JSON.parse(raw) as Partial<Record<keyof Focus, unknown>>;
    const store = typeof j.store === "string" && allow.stores.includes(j.store) ? j.store : null;
    const project = typeof j.project === "string" && allow.projects.includes(j.project) ? j.project : null;
    const ceo = allow.canCeo && j.ceo === true;
    return { store, project, ceo };
  } catch {
    return EMPTY_FOCUS;
  }
}

export function serializeFocus(f: Focus): string {
  return JSON.stringify({ store: f.store, project: f.project, ceo: f.ceo });
}

/** JARVIS の system prompt に入れる1行 */
export function focusPromptLines(f: Focus, names: { store?: string | null; project?: string | null }): string[] {
  const parts: string[] = [];
  if (f.store) parts.push(`店舗「${names.store ?? f.store}」に絞っている（数字・予約・シフトはこの店だけ。他店を混ぜない）`);
  if (f.project) parts.push(`案件「${names.project ?? f.project}」を見ている（この案件の記憶・紐づきを優先。「状況は？」は project.card）`);
  const out = parts.length ? [`## いまの Focus`, ...parts.map((p) => `- ${p}`)] : [];
  if (f.ceo) {
    out.push(
      "## CEO モード（経営者の目線）",
      "- 結論と判断が要ることを先に言う。数字は月次・前月比・目標差で語る（税抜）。",
      "- 現場の細かな手順より、売上・会員・体験→入会・人件費・止まっている定期処理を優先する。",
      "- 「今月の状況」「経営の数字」は skill.executive_report、「朝の確認」は skill.morning_briefing。"
    );
  }
  return out;
}
