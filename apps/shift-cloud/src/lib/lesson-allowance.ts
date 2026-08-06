// lesson-allowance.ts — パーソナルレッスン手当の純粋ロジック（DBアクセス禁止・server-only禁止）
// 算出元は Money OS の売上台帳（mon_sales_lines）。DB側の集計は関数 personal_lesson_counts（migration 0094）。
// 呼び出し元: app/admin/payroll/actions.ts（手当の取込）、app/admin/payroll/page.tsx（内訳表示）
//
// 決定（DECISIONS #105）:
//   - パーソナルレッスン（25分）1件 = 2,000円。**全スタッフ共通の単価**（スタッフ別マスタは持たない）
//   - 誰にどう払うかは mon_pros.payout_mode が持つ
//       payroll     … 給与の手当（payroll_allowances kind='personal'）
//       outsourcing … 業務委託費に上乗せ（給与明細に載せない。安東さん 2026-06〜）
//       none        … 対象外（古川さん＝月給・役員報酬）

/** パーソナルレッスン（25分）1件あたりの手当（円）。給与明細と一致させた値 */
export const PERSONAL_LESSON_UNIT_PRICE = 2000;

export type LessonPayoutMode = "payroll" | "outsourcing" | "none";

/** personal_lesson_counts() の1行 */
export type LessonCountRow = {
  /** 売上台帳の担当プロ表記（名寄せ前の生の値。未入力は '(未設定)'） */
  pro_name: string;
  staff_id: string | null;
  staff_name: string | null;
  payout_mode: LessonPayoutMode;
  /** 件数（返金はマイナス計上済み） */
  qty: number;
  /** 売上金額（円・参考値。手当額とは別物） */
  sales_amount: number;
};

export type LessonAllowanceRow = LessonCountRow & { amount: number };

/** 件数 → 手当額（円）。マイナス件数は0に丸める（返金で手当がマイナスにならないようにする） */
export function personalAllowanceAmount(qty: number, unitPrice = PERSONAL_LESSON_UNIT_PRICE): number {
  return Math.max(0, Math.floor(Number(qty) || 0)) * unitPrice;
}

export type LessonAllowanceSplit = {
  /** 給与の手当として payroll_allowances に取り込む行 */
  payroll: LessonAllowanceRow[];
  /** 業務委託費に上乗せする行（給与には入れない・画面に別枠で出す） */
  outsourcing: LessonAllowanceRow[];
  /** 対象外（月給者など）。件数はあるが支払わない＝説明のために残す */
  excluded: LessonAllowanceRow[];
  /** 担当プロがスタッフに紐付いていない行。取り込めないので画面で警告する */
  unlinked: LessonAllowanceRow[];
};

/**
 * 集計結果を支払区分ごとに仕分ける。
 * staff_id が無い行は payout_mode に関わらず unlinked（誰の手当か決まらないため取り込めない）。
 */
export function splitLessonCounts(
  rows: LessonCountRow[],
  unitPrice = PERSONAL_LESSON_UNIT_PRICE
): LessonAllowanceSplit {
  const out: LessonAllowanceSplit = { payroll: [], outsourcing: [], excluded: [], unlinked: [] };
  for (const r of rows) {
    const row: LessonAllowanceRow = { ...r, amount: personalAllowanceAmount(r.qty, unitPrice) };
    if (!r.staff_id) {
      out.unlinked.push(row);
      continue;
    }
    if (r.payout_mode === "payroll") out.payroll.push(row);
    else if (r.payout_mode === "outsourcing") out.outsourcing.push(row);
    else out.excluded.push(row);
  }
  return out;
}

/** 同じスタッフが複数の表記（例: 卜部/春馬）で出てきた場合に1行へ束ねる */
export function mergeByStaff(rows: LessonAllowanceRow[]): LessonAllowanceRow[] {
  const byStaff = new Map<string, LessonAllowanceRow>();
  for (const r of rows) {
    const key = r.staff_id ?? r.pro_name;
    const cur = byStaff.get(key);
    if (!cur) {
      byStaff.set(key, { ...r });
      continue;
    }
    cur.qty += r.qty;
    cur.sales_amount += r.sales_amount;
    cur.amount += r.amount;
    if (!cur.pro_name.includes(r.pro_name)) cur.pro_name = `${cur.pro_name}・${r.pro_name}`;
  }
  return [...byStaff.values()].sort((a, b) => b.qty - a.qty);
}

export function sumAmount(rows: LessonAllowanceRow[]): number {
  return rows.reduce((s, r) => s + r.amount, 0);
}
