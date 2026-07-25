/**
 * 会員集計の正典（DECISIONS #84 / REDESIGN §5c）
 * mbr_members の「誰を数えるか」ルールはここが唯一の定義。
 * genesis(kernel.ts) と shift-cloud(store-dash.ts) の重複実装を解消し、数字のズレを防ぐ。
 *
 * ルール:
 * - member_type='スタッフ' は顧客会員から除外
 * - member_type='トライアル会員' は在籍・入会に数えない（退会は「想定内」として別カウント）
 * - 在籍 = leave_date なしの本会員
 * - 月内判定は [月初, 翌月初) の半開区間（leave_date は月末付の退会予定日があるため範囲判定）
 */

export type MemberRow = {
  member_type: string | null;
  join_date: string | null;
  leave_date: string | null;
};

export type MemberStats = {
  /** 在籍（本会員） */
  active: number;
  /** 期間内入会（本会員） */
  joins: number;
  /** 期間内退会（本会員=痛い退会） */
  leavesCore: number;
  /** 期間内退会（トライアル=想定内） */
  leavesTrial: number;
};

export const isStaffMember = (memberType: string | null | undefined): boolean => (memberType ?? "") === "スタッフ";
export const isTrialMember = (memberType: string | null | undefined): boolean => (memberType ?? "") === "トライアル会員";

/** 退会理由の空欄・プレースホルダ（分析対象外の値） */
export const PLACEHOLDER_LEAVE_REASONS = new Set(["選択してください", "その他", ""]);

/** ISO日付 d が [from, to) に入るか（fromは月初 "YYYY-MM-01"、toは翌月初） */
export const inDateWindow = (d: string | null | undefined, from: string, to: string): boolean => !!d && d >= from && d < to;

/** 会員リストから在籍・入会・退会を集計する（期間 [from, to)） */
export function memberStats(rows: MemberRow[], from: string, to: string): MemberStats {
  const s: MemberStats = { active: 0, joins: 0, leavesCore: 0, leavesTrial: 0 };
  for (const m of rows) {
    if (isStaffMember(m.member_type)) continue;
    const trial = isTrialMember(m.member_type);
    if (!m.leave_date && !trial) s.active++;
    if (inDateWindow(m.join_date, from, to) && !trial) s.joins++;
    if (inDateWindow(m.leave_date, from, to)) {
      if (trial) s.leavesTrial++;
      else s.leavesCore++;
    }
  }
  return s;
}
