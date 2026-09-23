/**
 * FRANK会員の「課金対象」判定（2026-09-24 ユーザー指示・#273）
 *
 * ★ なぜ要るか
 *   会員一覧の見出しは「在籍 58名」と出ていたが、そこにはスタッフ6名・モニター1名・
 *   法人のご利用者23名が全部足されていた。月会費をいただいているのは28名で、
 *   30名ぶん多く見えていた。GENESIS の会員数・事業別PL も同じ数え方だったので、
 *   判定はこの1ファイルに置いて全画面で同じにする。
 *   （画面ごとに条件を書き足すと「会員管理では28なのにGENESISでは58」が起きる）
 *
 * ★ 課金対象＝「その行に月会費の請求が立つ人」。3つ全部を満たすとき
 *   1. プランが課金対象（frunk_plans.billable）。スタッフ・モニター・テスト会員は false。
 *      billable 列が無い/未設定の行は「月会費 > 0 か」で代替する（列を足す前のデータでも壊れない）
 *   2. 法人のご利用者ではない（corporate_parent_id が null）。
 *      法人は会社が払う＝サブスクは契約者の行にだけ立つ（frank-corporate-plans）。
 *      ご利用者を数えると、1社の契約が24人ぶんの会員に化ける
 *   3. 在籍している（active / suspended）。休会は在籍だがお金は止まるので、
 *      「課金対象で、いま請求が動いている人」は billingActive() で別に数える
 */

export type BillablePlanLike = {
  id: string;
  name?: string | null;
  /** frunk_plans.billable（migration 0198）。null/undefined なら monthly_price で代替 */
  billable?: boolean | null;
  monthly_price?: number | null;
};

export type BillableMemberLike = {
  status?: string | null;
  plan_id?: string | null;
  /** 法人のご利用者はここに契約者のidが入る（#206） */
  corporate_parent_id?: string | null;
};

/** 在籍とみなす状態。left・pending・rejected は会員ではない */
export const ENROLLED_STATUSES = ["active", "suspended"] as const;

/** プラン単体で課金対象か。billable 列が無いときは月会費>0 で代替する */
export function planIsBillable(plan: BillablePlanLike | null | undefined): boolean {
  if (!plan) return false; // プラン未設定は数えない（何を請求するか決まっていない）
  if (typeof plan.billable === "boolean") return plan.billable;
  return Number(plan.monthly_price ?? 0) > 0;
}

/** 課金対象から外れる理由。画面に「なぜ数えていないか」を出すために使う */
export type NotBillableReason = "no-plan" | "free-plan" | "corporate-user" | "not-enrolled";

export function notBillableReason(
  m: BillableMemberLike,
  planById: (id: string | null | undefined) => BillablePlanLike | null | undefined,
): NotBillableReason | null {
  if (!ENROLLED_STATUSES.includes(String(m.status ?? "") as (typeof ENROLLED_STATUSES)[number])) return "not-enrolled";
  if (m.corporate_parent_id) return "corporate-user";
  const plan = planById(m.plan_id);
  if (!plan) return "no-plan";
  if (!planIsBillable(plan)) return "free-plan";
  return null;
}

export const NOT_BILLABLE_LABEL: Record<NotBillableReason, string> = {
  "no-plan": "プラン未設定",
  "free-plan": "月会費なし（スタッフ・モニター等）",
  "corporate-user": "法人のご利用者（お支払いは契約者）",
  "not-enrolled": "在籍していない",
};

/** 月会費の請求が立つ1人か */
export function isBillableMember(
  m: BillableMemberLike,
  planById: (id: string | null | undefined) => BillablePlanLike | null | undefined,
): boolean {
  return notBillableReason(m, planById) === null;
}

/** プラン配列から引き手を作る（呼び出し側で Map を組み直さなくていいように） */
export function planLookup(plans: BillablePlanLike[]): (id: string | null | undefined) => BillablePlanLike | null {
  const byId = new Map(plans.map((p) => [String(p.id), p]));
  return (id) => byId.get(String(id ?? "")) ?? null;
}

export type BillableCounts = {
  /** 課金対象（在籍・法人ご利用者とスタッフ/モニターを除く） */
  billable: number;
  /** そのうち休会中＝在籍しているが今月の請求は止まっている */
  suspended: number;
  /** 課金対象から外した人数（理由ごと）。在籍している人だけ数える＝退会者は混ぜない */
  excluded: Record<Exclude<NotBillableReason, "not-enrolled">, number>;
};

/** 見出しに出す数を1回で作る。除外の内訳まで返す＝「なぜ58ではなく28なのか」を画面で言える */
export function countBillable(
  list: BillableMemberLike[],
  planById: (id: string | null | undefined) => BillablePlanLike | null | undefined,
): BillableCounts {
  const out: BillableCounts = {
    billable: 0,
    suspended: 0,
    excluded: { "no-plan": 0, "free-plan": 0, "corporate-user": 0 },
  };
  for (const m of list) {
    const reason = notBillableReason(m, planById);
    if (reason === "not-enrolled") continue;
    if (reason === null) {
      out.billable += 1;
      if (String(m.status ?? "") === "suspended") out.suspended += 1;
    } else {
      out.excluded[reason] += 1;
    }
  }
  return out;
}

/** 一覧の絞り込み用。"billable"=課金対象のみ / "excluded"=課金対象外のみ / ""=絞らない */
export type BillableFilter = "" | "billable" | "excluded";

export function matchesBillableFilter(
  m: BillableMemberLike,
  f: BillableFilter,
  planById: (id: string | null | undefined) => BillablePlanLike | null | undefined,
): boolean {
  if (!f) return true;
  const reason = notBillableReason(m, planById);
  // 在籍していない人は「課金対象外」にも入れない（退会者が絞り込みに紛れると人数が読めない）
  if (reason === "not-enrolled") return false;
  return f === "billable" ? reason === null : reason !== null;
}
