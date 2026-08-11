// 来店検索の表示用ラベル（純ロジックは visitor-search-pure.ts / テストはそちらに書く）

import { VISIT_TYPE_LABEL, RESULT_LABEL, PAYMENT_LABEL, GENDER_LABEL } from "./walkin";
import type { VisitKind } from "./visitor-search-pure";

export * from "./visitor-search-pure";

/* ---------------- 表示用ラベル ---------------- */

export const KIND_LABEL: Record<VisitKind, string> = {
  guest: "一時利用",
  member: "GOLF WING会員",
  frank: "FRANK会員",
  frank_guest: "FRANKビジター",
};

export const KIND_TONE: Record<VisitKind, "default" | "ok" | "accent" | "gold"> = {
  guest: "default",
  member: "gold",
  frank: "accent",
  frank_guest: "default",
};

export function visitTypeLabel(t: string | null | undefined): string {
  const k = String(t ?? "");
  if (k === "frank_bay") return "FRANK打席";
  if (k === "frank_visitor") return "FRANKビジター";
  return VISIT_TYPE_LABEL[k] ?? k ?? "—";
}

export function resultLabel(r: string | null | undefined): string | null {
  const k = String(r ?? "");
  if (!k || k === "none") return null;
  return RESULT_LABEL[k] ?? k;
}

export function paymentLabel(p: string | null | undefined): string | null {
  const k = String(p ?? "");
  if (!k) return null;
  return PAYMENT_LABEL[k] ?? k;
}

export function genderLabel(g: string | null | undefined): string | null {
  const k = String(g ?? "");
  if (!k) return null;
  return GENDER_LABEL[k] ?? k;
}

/** 生年月日 → 年齢（今日基準・JSTのズレは1日程度なので実用上問題なし） */
export function ageOf(birth: string | null): number | null {
  if (!birth || !/^\d{4}-\d{2}-\d{2}/.test(birth)) return null;
  const [y, m, d] = birth.slice(0, 10).split("-").map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  const md = (now.getMonth() + 1) * 100 + now.getDate();
  if (md < m * 100 + d) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export function fmtDay(d: string | null | undefined): string {
  const s = String(d ?? "");
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}/${Number(m[2])}/${Number(m[3])}` : "—";
}
