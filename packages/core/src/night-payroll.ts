// night-payroll.ts — ナイトビジネスの給与計算の正典（Night OS #231 / 2026-09-09）
//
// なぜ1か所に置くか:
//   時給アップ・指名・同伴・ドリンク・ボトルのバックが絡み合っていて、
//   画面ごとに計算を書くと「iPadの表示」と「キャストの明細」と「月次の締め」で
//   1円ずつズレる。ズレた瞬間にキャストは店を信用しなくなるので、
//   計算式はここだけに置き、画面は結果を表示するだけにする。
//
// 端数:
//   バック・サービス料・税はすべて **円未満切り捨て**（Math.floor）。
//   店側が多めに取る方向に丸めない、という考え方。
//
// 「確定した金額」は呼び出し側がDBに焼き付ける（nite_slip_items.back_amount / back_basis）。
//   → あとで設定を変えても、確定済みの過去の給与は動かない。

// ============================================================
// ルール（nite_rulesets.rules に入るJSONの型）
// ============================================================

export type BusinessType = "cabaret" | "lounge";

/** 日ごとに数えられる指標（時給アップ条件で使う） */
export type DailyMetric = "nomination" | "inhouse_nomination" | "douhan" | "cast_drink" | "bottle";

export type UpliftCondition =
  /** その日にお客様を連れてきた（同伴 or 紹介） */
  | { type: "brought_customer" }
  /** その日の本指名が N 本以上、など */
  | { type: "daily_count"; metric: DailyMetric; gte: number }
  /** その月の出勤が N 日以上（皆勤手当など） */
  | { type: "monthly_work_days"; gte: number };

export type UpliftEffect =
  /** 時給 +N%（その日だけ） */
  | { kind: "hourly_percent"; value: number }
  /** 時給 +N円（その日だけ） */
  | { kind: "hourly_yen"; value: number }
  /** 月の手当 N円 */
  | { kind: "monthly_allowance"; value: number };

export type UpliftRule = {
  id: string;
  label: string;
  when: UpliftCondition;
  effect: UpliftEffect;
  enabled?: boolean;
};

/** ドリンクの種類ごとのバック */
export type DrinkRule = {
  id: string;
  label: string;
  /** お客様のお会計（税抜） */
  price: number;
  /** fixed=1杯あたり定額 / percent=価格の% */
  backKind: "fixed" | "percent";
  backValue: number;
};

/** ボトル・シャンパンは価格帯でバック率が変わる */
export type BottleTier = {
  id: string;
  label: string;
  /** この金額以上（税抜） */
  minAmount: number;
  /** この金額未満。最上位は null */
  maxAmount: number | null;
  percent: number;
};

export type DeductionRule = {
  id: string;
  label: string;
  /** per_day=出勤1日あたり（送り代など） / per_late_minute=遅刻1分あたり / per_advance=日払い1回あたり */
  kind: "per_day" | "per_late_minute" | "per_advance";
  value: number;
  enabled?: boolean;
};

export type RuleSet = {
  businessType: BusinessType;
  /** サービス料率（0.20 = 20%） */
  serviceRate: number;
  /** 消費税率 */
  taxRate: number;
  /** お客様のお会計（税抜） */
  price: {
    setPerGuest: number;
    setMinutes: number;
    extendPerGuest: number;
    extendMinutes: number;
    nomination: number;
    inhouseNomination: number;
    douhan: number;
  };
  /** 指名・同伴のキャストバック（定額） */
  nominationBack: {
    nomination: number;
    inhouseNomination: number;
    douhan: number;
  };
  drinks: DrinkRule[];
  bottleTiers: BottleTier[];
  upliftRules: UpliftRule[];
  deductions: DeductionRule[];
  advance: {
    enabled: boolean;
    /** 1回あたりの手数料 */
    fee: number;
    /** 何時まで申請できるか（JSTの時） */
    cutoffHour: number;
  };
};

// ============================================================
// 伝票の明細
// ============================================================

export type ItemKind =
  | "set"
  | "extend"
  | "nomination"
  | "inhouse_nomination"
  | "douhan"
  | "cast_drink"
  | "bottle"
  | "food"
  | "other";

/** 担当キャストが要る種別（DB側 app.nite_item_needs_cast と一致させること） */
const NEEDS_CAST: ItemKind[] = ["nomination", "inhouse_nomination", "douhan", "cast_drink", "bottle"];

export function itemNeedsCast(kind: ItemKind): boolean {
  return NEEDS_CAST.includes(kind);
}

export type SlipItemInput = {
  kind: ItemKind;
  /** 税抜の合計（unit_price * qty） */
  amount: number;
  qty: number;
  castId: string | null;
  /** ドリンクのとき、どの DrinkRule か */
  drinkRuleId?: string | null;
  status?: "active" | "void";
};

/** バックの根拠。あとで「なぜこの金額か」を説明するために残す */
export type BackBasis = {
  rule: string;
  label: string;
  kind: "fixed" | "percent";
  value: number;
  base: number;
};

export type BackResult = { amount: number; basis: BackBasis | null };

/**
 * 明細1行のキャストバックを出す。
 * 取り消し(void)・担当なしは 0円（取り消した分がバックに残らないようにする）。
 */
export function calcItemBack(rules: RuleSet, item: SlipItemInput): BackResult {
  if (item.status === "void") return { amount: 0, basis: null };
  if (!item.castId) return { amount: 0, basis: null };

  switch (item.kind) {
    case "nomination":
      return fixed("nomination", "本指名", rules.nominationBack.nomination * item.qty, rules.nominationBack.nomination, item.amount);
    case "inhouse_nomination":
      return fixed("inhouse_nomination", "場内指名", rules.nominationBack.inhouseNomination * item.qty, rules.nominationBack.inhouseNomination, item.amount);
    case "douhan":
      return fixed("douhan", "同伴", rules.nominationBack.douhan * item.qty, rules.nominationBack.douhan, item.amount);
    case "cast_drink": {
      const rule = rules.drinks.find((d) => d.id === item.drinkRuleId);
      if (!rule) return { amount: 0, basis: null };
      if (rule.backKind === "fixed") {
        return fixed(`drink:${rule.id}`, rule.label, rule.backValue * item.qty, rule.backValue, item.amount);
      }
      const amount = Math.floor((item.amount * rule.backValue) / 100);
      return {
        amount,
        basis: { rule: `drink:${rule.id}`, label: rule.label, kind: "percent", value: rule.backValue, base: item.amount },
      };
    }
    case "bottle": {
      const tier = findBottleTier(rules, item.amount);
      if (!tier) return { amount: 0, basis: null };
      const amount = Math.floor((item.amount * tier.percent) / 100);
      return {
        amount,
        basis: { rule: `bottle:${tier.id}`, label: tier.label, kind: "percent", value: tier.percent, base: item.amount },
      };
    }
    default:
      return { amount: 0, basis: null };
  }

  function fixed(rule: string, label: string, amount: number, unit: number, base: number): BackResult {
    return { amount, basis: { rule, label, kind: "fixed", value: unit, base } };
  }
}

/**
 * 価格帯を1本に決める。境界は「min以上・max未満」。
 * 上限を null にした段が最上位（¥100,000以上=30% など）。
 */
export function findBottleTier(rules: RuleSet, amount: number): BottleTier | null {
  const sorted = [...rules.bottleTiers].sort((a, b) => a.minAmount - b.minAmount);
  for (const t of sorted) {
    const okMin = amount >= t.minAmount;
    const okMax = t.maxAmount == null || amount < t.maxAmount;
    if (okMin && okMax) return t;
  }
  return null;
}

// ============================================================
// 伝票のお会計
// ============================================================

export type SlipTotals = {
  subtotal: number;
  serviceCharge: number;
  tax: number;
  total: number;
  serviceRate: number;
  taxRate: number;
};

/** お会計 = (税抜小計 + サービス料) × 税。取り消した行は入れない */
export function calcSlipTotals(rules: RuleSet, items: SlipItemInput[]): SlipTotals {
  const subtotal = items
    .filter((i) => i.status !== "void")
    .reduce((sum, i) => sum + i.amount, 0);
  const serviceCharge = Math.floor(subtotal * rules.serviceRate);
  const tax = Math.floor((subtotal + serviceCharge) * rules.taxRate);
  return {
    subtotal,
    serviceCharge,
    tax,
    total: subtotal + serviceCharge + tax,
    serviceRate: rules.serviceRate,
    taxRate: rules.taxRate,
  };
}

// ============================================================
// 1日の給与（日当）
// ============================================================

export type DailyMetrics = Record<DailyMetric, number>;

export function emptyMetrics(): DailyMetrics {
  return { nomination: 0, inhouse_nomination: 0, douhan: 0, cast_drink: 0, bottle: 0 };
}

/** そのキャストの、その日の明細から本数を数える（取り消しは数えない） */
export function countMetrics(items: SlipItemInput[]): DailyMetrics {
  const m = emptyMetrics();
  for (const i of items) {
    if (i.status === "void") continue;
    if (i.kind in m) m[i.kind as DailyMetric] += i.qty;
  }
  return m;
}

export type AppliedUplift = {
  id: string;
  label: string;
  kind: UpliftEffect["kind"];
  value: number;
  /** その日の時給に実際に足された円（月の手当は0） */
  yen: number;
};

export type HourlyResult = {
  base: number;
  applied: number;
  uplifts: AppliedUplift[];
};

/**
 * その日の時給を出す。
 * %と円が両方当たったら「%を先に、円を後で」足す（%が円にも掛かって膨らむのを防ぐ）。
 */
export function resolveHourlyWage(
  rules: RuleSet,
  base: number,
  ctx: { metrics: DailyMetrics; broughtCustomer: boolean }
): HourlyResult {
  const uplifts: AppliedUplift[] = [];
  let percentSum = 0;
  let yenSum = 0;

  for (const rule of rules.upliftRules) {
    if (rule.enabled === false) continue;
    if (rule.effect.kind === "monthly_allowance") continue; // 月の手当は日当に入れない
    if (!matchDaily(rule.when, ctx)) continue;

    if (rule.effect.kind === "hourly_percent") {
      percentSum += rule.effect.value;
      uplifts.push({ id: rule.id, label: rule.label, kind: rule.effect.kind, value: rule.effect.value, yen: 0 });
    } else {
      yenSum += rule.effect.value;
      uplifts.push({ id: rule.id, label: rule.label, kind: rule.effect.kind, value: rule.effect.value, yen: rule.effect.value });
    }
  }

  const afterPercent = Math.floor(base * (1 + percentSum / 100));
  for (const u of uplifts) {
    if (u.kind === "hourly_percent") u.yen = Math.floor((base * u.value) / 100);
  }
  return { base, applied: afterPercent + yenSum, uplifts };
}

function matchDaily(when: UpliftCondition, ctx: { metrics: DailyMetrics; broughtCustomer: boolean }): boolean {
  switch (when.type) {
    case "brought_customer":
      return ctx.broughtCustomer;
    case "daily_count":
      return ctx.metrics[when.metric] >= when.gte;
    case "monthly_work_days":
      return false; // 月次でしか判定しない
  }
}

export type DailyPayInput = {
  /** ランク or 個別設定の時給 */
  baseHourlyWage: number;
  /** 実働分。15分単位などの丸めは呼び出し側で済ませておく */
  minutes: number;
  /** そのキャストが担当になっている、その日の明細 */
  items: SlipItemInput[];
  /** その日、このキャストがお客様を連れてきたか（同伴・紹介） */
  broughtCustomer: boolean;
  /** 遅刻分（控除ルールが有効なときだけ使う） */
  lateMinutes?: number;
  /** その日の日払い件数（手数料の控除に使う） */
  advanceCount?: number;
};

export type DailyPay = {
  hourly: HourlyResult;
  minutes: number;
  hourlyPay: number;
  metrics: DailyMetrics;
  backs: Array<{ kind: ItemKind; amount: number; basis: BackBasis | null }>;
  backTotal: number;
  deductions: Array<{ id: string; label: string; amount: number }>;
  deductionTotal: number;
  /** 日当 = 時給分 + バック − 控除 */
  net: number;
};

export function calcDailyPay(rules: RuleSet, input: DailyPayInput): DailyPay {
  const metrics = countMetrics(input.items);
  const hourly = resolveHourlyWage(rules, input.baseHourlyWage, {
    metrics,
    broughtCustomer: input.broughtCustomer,
  });
  const hourlyPay = Math.floor((hourly.applied * input.minutes) / 60);

  const backs = input.items
    .filter((i) => i.status !== "void")
    .map((i) => {
      const r = calcItemBack(rules, i);
      return { kind: i.kind, amount: r.amount, basis: r.basis };
    })
    .filter((b) => b.amount !== 0);
  const backTotal = backs.reduce((s, b) => s + b.amount, 0);

  const deductions: Array<{ id: string; label: string; amount: number }> = [];
  for (const d of rules.deductions) {
    if (d.enabled === false) continue;
    let amount = 0;
    if (d.kind === "per_day" && input.minutes > 0) amount = d.value;
    if (d.kind === "per_late_minute") amount = d.value * (input.lateMinutes ?? 0);
    if (d.kind === "per_advance") amount = d.value * (input.advanceCount ?? 0);
    if (amount > 0) deductions.push({ id: d.id, label: d.label, amount });
  }
  const deductionTotal = deductions.reduce((s, d) => s + d.amount, 0);

  return {
    hourly,
    minutes: input.minutes,
    hourlyPay,
    metrics,
    backs,
    backTotal,
    deductions,
    deductionTotal,
    net: hourlyPay + backTotal - deductionTotal,
  };
}

// ============================================================
// 月次の締め
// ============================================================

export type MonthlyInput = {
  days: Array<{ businessDate: string; pay: DailyPay }>;
  /** その月に受け取り済みの日払い（手数料込み） */
  advanceTotal: number;
  /** 手で入れた訂正（+/-） */
  adjustments?: Array<{ amount: number; reason: string }>;
};

export type PayrollLine = {
  workDays: number;
  workMinutes: number;
  hourlyTotal: number;
  backTotal: number;
  allowanceTotal: number;
  allowances: Array<{ id: string; label: string; amount: number }>;
  deductionTotal: number;
  adjustmentTotal: number;
  advanceTotal: number;
  /** 支給額（日払いを引く前） */
  gross: number;
  /** 実際にお渡しする額。日払いが多いとマイナスになりうる */
  net: number;
  /** マイナス支給など、人が見て確認すべき行 */
  needsReview: boolean;
};

export function calcMonthlyPayroll(rules: RuleSet, input: MonthlyInput): PayrollLine {
  const workDays = input.days.filter((d) => d.pay.minutes > 0).length;
  const workMinutes = sum(input.days.map((d) => d.pay.minutes));
  const hourlyTotal = sum(input.days.map((d) => d.pay.hourlyPay));
  const backTotal = sum(input.days.map((d) => d.pay.backTotal));
  const deductionTotal = sum(input.days.map((d) => d.pay.deductionTotal));

  const allowances: Array<{ id: string; label: string; amount: number }> = [];
  for (const rule of rules.upliftRules) {
    if (rule.enabled === false) continue;
    if (rule.effect.kind !== "monthly_allowance") continue;
    if (rule.when.type !== "monthly_work_days") continue;
    if (workDays >= rule.when.gte) {
      allowances.push({ id: rule.id, label: rule.label, amount: rule.effect.value });
    }
  }
  const allowanceTotal = sum(allowances.map((a) => a.amount));
  const adjustmentTotal = sum((input.adjustments ?? []).map((a) => a.amount));

  const gross = hourlyTotal + backTotal + allowanceTotal - deductionTotal + adjustmentTotal;
  const net = gross - input.advanceTotal;

  return {
    workDays,
    workMinutes,
    hourlyTotal,
    backTotal,
    allowanceTotal,
    allowances,
    deductionTotal,
    adjustmentTotal,
    advanceTotal: input.advanceTotal,
    gross,
    net,
    needsReview: net < 0,
  };
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

// ============================================================
// 既定のルール（新しい店を作ったときの初期値）
//   数字は店ごとに設定画面から変える前提。ここは「よくある形」を置いているだけ。
// ============================================================

export function defaultRuleSet(businessType: BusinessType = "cabaret"): RuleSet {
  const cabaret: RuleSet = {
    businessType: "cabaret",
    serviceRate: 0.2,
    taxRate: 0.1,
    price: {
      setPerGuest: 11000,
      setMinutes: 60,
      extendPerGuest: 11000,
      extendMinutes: 60,
      nomination: 5500,
      inhouseNomination: 3300,
      douhan: 3300,
    },
    nominationBack: { nomination: 2000, inhouseNomination: 1000, douhan: 3000 },
    drinks: [
      { id: "house", label: "ハウス", price: 1500, backKind: "fixed", backValue: 750 },
      { id: "cocktail", label: "カクテル", price: 2000, backKind: "fixed", backValue: 1000 },
      { id: "champagne_glass", label: "シャンパン(グラス)", price: 3000, backKind: "fixed", backValue: 1500 },
    ],
    bottleTiers: [
      { id: "t1", label: "¥30,000 未満", minAmount: 0, maxAmount: 30000, percent: 20 },
      { id: "t2", label: "¥30,000〜99,999", minAmount: 30000, maxAmount: 100000, percent: 25 },
      { id: "t3", label: "¥100,000 以上", minAmount: 100000, maxAmount: null, percent: 30 },
    ],
    upliftRules: [
      {
        id: "brought",
        label: "お客様を連れてきた（同伴・紹介）",
        when: { type: "brought_customer" },
        effect: { kind: "hourly_percent", value: 20 },
      },
      {
        id: "nomination3",
        label: "本指名 3本以上",
        when: { type: "daily_count", metric: "nomination", gte: 3 },
        effect: { kind: "hourly_yen", value: 500 },
      },
      {
        id: "perfect",
        label: "皆勤手当",
        when: { type: "monthly_work_days", gte: 20 },
        effect: { kind: "monthly_allowance", value: 20000 },
      },
    ],
    deductions: [
      { id: "soukuri", label: "送り代", kind: "per_day", value: 1000 },
      { id: "late", label: "遅刻", kind: "per_late_minute", value: 100, enabled: false },
      { id: "advance_fee", label: "日払い手数料", kind: "per_advance", value: 500 },
    ],
    advance: { enabled: true, fee: 500, cutoffHour: 24 },
  };

  if (businessType === "cabaret") return cabaret;

  // ガールズバー・ラウンジ: 指名の概念が薄く、時給＋ドリンクバック中心
  return {
    ...cabaret,
    businessType: "lounge",
    price: { ...cabaret.price, setPerGuest: 3000, nomination: 1100, inhouseNomination: 0, douhan: 2200 },
    nominationBack: { nomination: 500, inhouseNomination: 0, douhan: 1500 },
    drinks: [
      { id: "house", label: "ドリンク", price: 800, backKind: "fixed", backValue: 400 },
      { id: "shot", label: "ショット", price: 1200, backKind: "fixed", backValue: 600 },
    ],
    bottleTiers: [
      { id: "t1", label: "¥20,000 未満", minAmount: 0, maxAmount: 20000, percent: 15 },
      { id: "t2", label: "¥20,000 以上", minAmount: 20000, maxAmount: null, percent: 20 },
    ],
    upliftRules: [
      {
        id: "brought",
        label: "お客様を連れてきた",
        when: { type: "brought_customer" },
        effect: { kind: "hourly_percent", value: 10 },
      },
      {
        id: "drink5",
        label: "ドリンク 5杯以上",
        when: { type: "daily_count", metric: "cast_drink", gte: 5 },
        effect: { kind: "hourly_yen", value: 300 },
      },
    ],
  };
}
