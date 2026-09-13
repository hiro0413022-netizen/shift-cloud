/**
 * フィッティング見積の計算の正典（craft-os）。
 *
 * ★ 割引とフィッティング料返金の式は、ここ1か所だけに置く。
 *   （DEVELOPMENT_RULES「数字の正典は1本だけ」／compe-score・night-payroll と同じ方針）
 *
 *   これまでは Excel の隠しシート「見積のルール」「シャフト割引率」を
 *   スタッフが見ながら、お客様の前で暗算していた。
 *   同じ条件なら誰が作っても同じ金額になる、という状態をここで作る。
 *
 * ★ 掛け率（rate）で持つ。0.80 = 20%OFF。
 *   シャフトの割引率表（-20/-30/-10%）も、クラブの掛け率（0.9/0.85）も、
 *   同じ1つの形で書けるため。
 *
 * ★ 定価は golfwing.products が正典。この関数は渡された定価を信用する。
 *   見積を作った時点の定価は quote_items.list_price に写し取る
 *   （あとで値上げがあっても、出した見積の金額は動かさない）。
 */

// ---------------------------------------------------------------------------
// お客様区分
// ---------------------------------------------------------------------------

/**
 * お客様区分。Excel「シャフト割引率」表の3列に、
 * 「フィッティング歴のない一見のビジター」を足した4区分。
 * （2026-09-12 ユーザー判断：クラブはビジターでも、フィッティングを受けたことがある方・
 *   旧会員などは20%OFFで出す。一見のお客様とは分ける必要がある）
 */
export type Segment =
  | "visitor_no_fitting"    // 一見のビジター（フィッティング歴なし）
  | "visitor_or_intro"      // ビジター（フィッティング歴あり）／プロ紹介／再フィッティングの会員／旧会員
  | "member_paid_fitting"   // フィッティング料金を支払った会員
  | "from_demo_or_lesson";  // 試打からの購入／会員がレッスン時に購入

/** 会員・ビジター・スタッフ。スタッフは仕入値（掛け率）で出す */
export type MemberKind = "会員" | "ビジター" | "スタッフ";

export const SEGMENT_LABELS: Record<Segment, string> = {
  visitor_no_fitting: "ビジター（フィッティング歴なし）",
  visitor_or_intro: "ビジター（フィッティング歴あり）／プロ紹介／再フィッティングの会員／旧会員",
  member_paid_fitting: "フィッティング料金を支払った会員",
  from_demo_or_lesson: "試打からの購入／レッスン時のご購入",
};

// ---------------------------------------------------------------------------
// 割引ルール（golfwing.discount_rules の1行）
// ---------------------------------------------------------------------------

export type DiscountRule = {
  id?: number | string;
  item_category: string;            // 'シャフト' 'クラブ' 'グリップ' 'ボール' 'ハドラス' '工賃' '*'
  manufacturer?: string | null;     // null = そのカテゴリの既定
  segment?: Segment | null;
  member_kind?: MemberKind | null;
  rate: number | string;            // 掛け率
  priority?: number | null;
  note?: string | null;
  is_active?: boolean | null;
  effective_from?: string | null;
  effective_to?: string | null;
};

export type DiscountContext = {
  itemCategory: string;
  manufacturer?: string | null;
  segment: Segment;
  memberKind: MemberKind;
  /** 商品マスタの仕入掛け率（golfwing.products.default_rate）。スタッフ購入のときだけ使う */
  supplierRate?: number | string | null;
  /** 判定日。省略時は今日（JSTの日付文字列 YYYY-MM-DD を想定） */
  onDate?: string | null;
};

export type DiscountResolution = {
  rate: number;
  rule: DiscountRule | null;
  /** なぜこの率になったのかを画面と記録に残すための一言 */
  reason: string;
};

function num(v: number | string | null | undefined, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : fallback;
}

/** メーカー名の比較用。全角空白と空白を落として大文字化する（trpx と TRPX、Arch と ARCH を同じに扱う） */
export function normMaker(s: string | null | undefined): string {
  return (s ?? "").replace(/[\s　]/g, "").toUpperCase();
}

function ruleActiveOn(rule: DiscountRule, onDate: string): boolean {
  if (rule.is_active === false) return false;
  if (rule.effective_from && rule.effective_from > onDate) return false;
  if (rule.effective_to && rule.effective_to < onDate) return false;
  return true;
}

/**
 * 割引ルールを1つ選ぶ。
 * より具体的な行が勝つ：カテゴリ一致 > '*' ／ メーカー指定あり > 既定 ／ 区分指定あり > 既定。
 * 同じ具体度なら priority の大きい方。どれにも当たらなければ 1.0（割引しない）。
 */
export function resolveDiscount(rules: DiscountRule[], ctx: DiscountContext): DiscountResolution {
  // スタッフ購入は仕入値で出す（2026-09-12 ユーザー判断）。ルール表は引かない。
  // 仕入掛け率が商品マスタに入っていない商品は、割引せずに出して手で直してもらう。
  if (ctx.memberKind === "スタッフ") {
    const sr = num(ctx.supplierRate, 0);
    if (sr > 0 && sr <= 1) {
      return { rate: sr, rule: null, reason: `スタッフ購入：仕入値（掛け率 ${sr}）` };
    }
    return { rate: 1, rule: null, reason: "スタッフ購入：仕入掛け率が商品マスタに無いため割引なし（要手入力）" };
  }

  const onDate = ctx.onDate ?? new Date().toISOString().slice(0, 10);
  const mk = normMaker(ctx.manufacturer);

  let best: DiscountRule | null = null;
  let bestScore = -Infinity;

  for (const r of rules) {
    if (!ruleActiveOn(r, onDate)) continue;

    let score = 0;
    if (r.item_category === ctx.itemCategory) score += 1000;
    else if (r.item_category === "*") score += 0;
    else continue;

    if (r.manufacturer) {
      if (normMaker(r.manufacturer) !== mk) continue;
      score += 100;
    }
    if (r.segment) {
      if (r.segment !== ctx.segment) continue;
      score += 10;
    }
    if (r.member_kind) {
      if (r.member_kind !== ctx.memberKind) continue;
      score += 10;
    }
    score += num(r.priority, 0);

    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  if (!best) {
    return { rate: 1, rule: null, reason: "該当する割引ルールが無いため割引なし" };
  }

  const rate = num(best.rate, 1);
  const off = Math.round((1 - rate) * 1000) / 10; // 20.0 のような表示用
  const who = best.segment ? SEGMENT_LABELS[best.segment] : best.member_kind ?? "全員";
  const maker = best.manufacturer ? `${best.manufacturer} ` : "";
  const reason =
    off === 0
      ? `${maker}${best.item_category}／${who}：割引なし`
      : `${maker}${best.item_category}／${who}：${off}%OFF`;

  return { rate, rule: best, reason };
}

// ---------------------------------------------------------------------------
// 明細1行の金額
// ---------------------------------------------------------------------------

export type QuoteLineInput = {
  listPrice: number | string;
  quantity?: number | null;
  /** 掛け率。省略時は resolveDiscount で決める */
  rate?: number | null;
  /** 手で値引額を入れたとき（負の数）。rate より優先する */
  manualDiscountAmount?: number | null;
  taxFree?: boolean | null;
};

export type QuoteLineAmounts = {
  listPrice: number;
  quantity: number;
  rate: number | null;
  /** 値引額（負の数。1本あたり） */
  discountAmount: number;
  /** 定価＋値引額（1本あたり） */
  unitPrice: number;
  /** unitPrice × quantity */
  amount: number;
};

/**
 * 1行の金額。Excelの `=SUM(定価+値引額)*数量` と同じ形にしてある。
 * 端数は円単位に丸める（定価がすべて100円単位なので実際には発生しない）。
 */
export function computeLine(line: QuoteLineInput, rate?: number | null): QuoteLineAmounts {
  const listPrice = num(line.listPrice, 0);
  const quantity = Math.max(1, Math.trunc(num(line.quantity, 1)));
  const usedRate = line.manualDiscountAmount != null ? null : num(line.rate ?? rate, 1);

  const discountAmount =
    line.manualDiscountAmount != null
      ? Math.round(num(line.manualDiscountAmount, 0))
      : Math.round(listPrice * ((usedRate as number) - 1));

  const unitPrice = listPrice + discountAmount;
  return {
    listPrice,
    quantity,
    rate: usedRate,
    discountAmount,
    unitPrice,
    amount: unitPrice * quantity,
  };
}

// ---------------------------------------------------------------------------
// フィッティング料の返金（購入時割引）
// ---------------------------------------------------------------------------

export type FittingMinutes = 55 | 110;

export type ClubCounts = {
  /** ドライバーの本数 */
  DR?: number | null;
  FW?: number | null;
  UT?: number | null;
};

export type RefundResult = {
  amount: number;
  /** 上限で丸める前の積み上げ額 */
  rawAmount: number;
  cap: number;
  /** 何をどう数えたか（画面と記録に出す） */
  breakdown: string[];
  capped: boolean;
};

/** 上限（Excel「見積のルール」：110分は22,000、55分は16,500） */
export const REFUND_CAP: Record<FittingMinutes, number> = { 110: 22000, 55: 16500 };

function fwRefund(minutes: FittingMinutes, n: number): number {
  if (n <= 0) return 0;
  if (minutes === 110) {
    if (n >= 3) return 22000;
    if (n === 2) return 16500;
    return 8250;
  }
  if (n >= 2) return 16500;
  return 8250;
}

function utRefund(_minutes: FittingMinutes, n: number): number {
  if (n >= 3) return 11000;
  if (n === 2) return 8250;
  return 0; // 1本は返金なし（110分・55分とも）
}

/**
 * フィッティング料の返金額。
 *
 * Excel「見積のルール」の表をそのまま実装している。
 *   110分（22,000円）… DRを含む2本以上→22,000 ／ DR1本のみ→16,500
 *                      FW 3本以上→22,000・2本→16,500・1本→8,250
 *                      UT 3本以上→11,000・2本→8,250・1本→0
 *   55分（16,500円） … DR購入→16,500
 *                      FW 2本以上→16,500・1本→8,250
 *                      UT 3本以上→11,000・2本→8,250・1本→0
 * FW と UT は積み上げてから上限で丸める（表の計算例②がこの形）。
 *
 * ⚠ 表の「DRを含む2本以上→22,000」を文字どおり実装している。
 *   そのため DR1本＋UT1本は、UT単独なら0円でも満額22,000円になる。
 *   意図どおりかは要確認（NEXT_TASKS の craft-os 項に記載）。
 */
export function computeFittingRefund(
  minutes: FittingMinutes | number | null | undefined,
  counts: ClubCounts,
): RefundResult {
  const m = (minutes === 110 || minutes === 55 ? minutes : null) as FittingMinutes | null;
  const dr = Math.max(0, Math.trunc(num(counts.DR, 0)));
  const fw = Math.max(0, Math.trunc(num(counts.FW, 0)));
  const ut = Math.max(0, Math.trunc(num(counts.UT, 0)));

  if (!m) {
    return {
      amount: 0,
      rawAmount: 0,
      cap: 0,
      breakdown: ["フィッティング料のご利用が無いため返金なし"],
      capped: false,
    };
  }

  const cap = REFUND_CAP[m];
  const total = dr + fw + ut;
  const breakdown: string[] = [];

  if (total === 0) {
    return { amount: 0, rawAmount: 0, cap, breakdown: ["ご購入が無いため返金なし"], capped: false };
  }

  // ドライバーを含むときは表の専用行が優先する
  if (dr >= 1) {
    if (m === 110) {
      if (total >= 2) {
        breakdown.push(`ドライバーを含む2本以上（計${total}本）→ 22,000円`);
        return { amount: 22000, rawAmount: 22000, cap, breakdown, capped: false };
      }
      breakdown.push("ドライバー1本 → 16,500円");
      return { amount: 16500, rawAmount: 16500, cap, breakdown, capped: false };
    }
    breakdown.push("ドライバーご購入 → 16,500円");
    return { amount: 16500, rawAmount: 16500, cap, breakdown, capped: false };
  }

  const fwAmt = fwRefund(m, fw);
  const utAmt = utRefund(m, ut);
  if (fw > 0) breakdown.push(`FW ${fw}本 → ${fwAmt.toLocaleString("ja-JP")}円`);
  if (ut > 0) breakdown.push(`UT ${ut}本 → ${utAmt.toLocaleString("ja-JP")}円`);

  const raw = fwAmt + utAmt;
  const amount = Math.min(raw, cap);
  if (amount < raw) {
    breakdown.push(`合計 ${raw.toLocaleString("ja-JP")}円 → 上限 ${cap.toLocaleString("ja-JP")}円で丸め`);
  }
  return { amount, rawAmount: raw, cap, breakdown, capped: amount < raw };
}

/** 明細から DR/FW/UT の本数を数える（返金の入力）。商品行だけを数える */
export function countClubs(
  items: { club_type?: string | null; quantity?: number | null; line_kind?: string | null }[],
): ClubCounts {
  const c: ClubCounts = { DR: 0, FW: 0, UT: 0 };
  for (const it of items) {
    if (it.line_kind && it.line_kind !== "product") continue;
    const t = (it.club_type ?? "").toUpperCase();
    if (t !== "DR" && t !== "FW" && t !== "UT") continue;
    const q = Math.max(1, Math.trunc(num(it.quantity, 1)));
    c[t] = (c[t] ?? 0) + q;
  }
  return c;
}

// ---------------------------------------------------------------------------
// 見積の合計
// ---------------------------------------------------------------------------

export type QuoteTotalsInput = {
  /** 各行の amount（computeLine の結果） */
  amounts: number[];
  taxRate?: number | null;      // 既定 0.10
  taxFreeAmount?: number | null; // 税別品
  prepaidAmount?: number | null; // 前受金（差し引く）
  refundAmount?: number | null;  // フィッティング料返金（税込の額として差し引く）
};

export type QuoteTotals = {
  subtotal: number;   // 小計（税抜）
  tax: number;        // 消費税
  taxFree: number;    // 税別品
  refund: number;     // 返金
  prepaid: number;    // 前受金
  total: number;      // 合計
};

/**
 * 合計。Excelの並び（小計 → 消費税 → 税別品 → 合計）に合わせている。
 *
 * ⚠ フィッティング料の返金は**税込の額として最後に差し引く**。
 *   22,000／16,500／11,000／8,250 はいずれも税抜×1.1 のちょうどの数字で、
 *   料金表の税込金額そのものだから。ここは運用の確認が要る。
 *
 * ⚠ 合計は Excel と同じく ROUNDDOWN（切り捨て）。
 */
export function computeTotals(input: QuoteTotalsInput): QuoteTotals {
  const subtotal = input.amounts.reduce((a, b) => a + num(b, 0), 0);
  const taxRate = num(input.taxRate, 0.1);
  const tax = Math.round(subtotal * taxRate);
  const taxFree = num(input.taxFreeAmount, 0);
  const refund = num(input.refundAmount, 0);
  const prepaid = num(input.prepaidAmount, 0);
  const total = Math.floor(subtotal + tax + taxFree - refund - prepaid);
  return { subtotal, tax, taxFree, refund, prepaid, total };
}

// ---------------------------------------------------------------------------
// まとめて計算する（画面から呼ぶ入口はここ1つ）
// ---------------------------------------------------------------------------

export type QuoteItemInput = {
  line_no?: number;
  line_kind?: string | null;
  item_category?: string | null;
  manufacturer?: string | null;
  club_type?: string | null;
  list_price: number | string;
  quantity?: number | null;
  tax_free?: boolean | null;
  /** 商品マスタの仕入掛け率（スタッフ購入のとき使う） */
  supplier_rate?: number | string | null;
  /** 手で上書きしたとき。掛け率でも値引額でも、どちらでも受ける */
  discount_manual?: boolean | null;
  discount_rate?: number | null;
  discount_amount?: number | null;
};

export type QuoteInput = {
  segment: Segment;
  memberKind: MemberKind;
  fittingMinutes?: FittingMinutes | number | null;
  taxRate?: number | null;
  taxFreeAmount?: number | null;
  prepaidAmount?: number | null;
  /** 返金を手で決めたとき。null なら自動計算 */
  refundOverride?: number | null;
  onDate?: string | null;
};

export type PricedItem = QuoteItemInput & QuoteLineAmounts & { discountReason: string };

export type QuoteResult = {
  items: PricedItem[];
  clubCounts: ClubCounts;
  refund: RefundResult;
  totals: QuoteTotals;
};

export function priceQuote(
  items: QuoteItemInput[],
  quote: QuoteInput,
  rules: DiscountRule[],
): QuoteResult {
  const priced: PricedItem[] = items.map((it) => {
    // 手で打ち替えたとき。掛け率を選び直した場合と、値引額を直接入れた場合の両方を受ける。
    // （2026-09-12 ユーザー判断：人によって割引率が変わるので、その場で設定できること）
    const manualRate = it.discount_manual === true && it.discount_rate != null;
    const manualAmount = it.discount_manual === true && it.discount_rate == null && it.discount_amount != null;

    let res: DiscountResolution;
    if (manualRate) {
      const r = num(it.discount_rate, 1);
      res = { rate: r, rule: null, reason: `手で設定した掛け率 ${r}（${Math.round((1 - r) * 1000) / 10}%OFF）` };
    } else if (manualAmount) {
      res = { rate: 1, rule: null, reason: "手入力の値引き" };
    } else {
      res = resolveDiscount(rules, {
        itemCategory: it.item_category ?? "*",
        manufacturer: it.manufacturer,
        segment: quote.segment,
        memberKind: quote.memberKind,
        supplierRate: it.supplier_rate,
        onDate: quote.onDate,
      });
    }

    const amounts = computeLine(
      {
        listPrice: it.list_price,
        quantity: it.quantity,
        taxFree: it.tax_free,
        manualDiscountAmount: manualAmount ? num(it.discount_amount, 0) : null,
      },
      res.rate,
    );
    return { ...it, ...amounts, discountReason: res.reason };
  });

  const clubCounts = countClubs(items);
  const refund = computeFittingRefund(quote.fittingMinutes, clubCounts);
  const refundAmount = quote.refundOverride != null ? num(quote.refundOverride, 0) : refund.amount;

  const totals = computeTotals({
    amounts: priced.map((p) => p.amount),
    taxRate: quote.taxRate,
    taxFreeAmount: quote.taxFreeAmount,
    prepaidAmount: quote.prepaidAmount,
    refundAmount,
  });

  return { items: priced, clubCounts, refund, totals };
}
