/**
 * 現金・振込でお受けした分を手で記録する（#278・2026-09-25 ユーザー依頼）
 *
 * ★ なぜ要るか
 *   領収書（#222）は「実際に入金として記録された行（mon_sales）」からしか作れない。
 *   これは「受け取っていない金額の領収書を作れない」ようにするための決まりで、これは変えない。
 *   ただし mon_sales に行を書いているのは Square の Webhook だけなので、
 *   **現金や振込でお受けした分は1行も無く、領収書のパネルに何も出ない**（ユーザー報告）。
 *   ＝金額の入力を許すのではなく、「お受けしたことの記録」を先に作れるようにする。
 *
 * ★ 記録＝お金を受け取った事実。だから
 *   - 未来の日付では記録させない（まだ受け取っていない）
 *   - 0円・マイナスは受け付けない（返金は別の扱い）
 *   - 誰がいつ記録したかを必ず残す（Squareの行と見分けがつくようにする）
 *
 * ★ 金額は税込で受け取る
 *   店頭でお客様からいただく額＝税込。mon_sales は税抜(amount)と税込(tax_included)を
 *   両方持つので、ここで割り戻す（Square Webhook と同じ式）。
 */

/** 手で記録できるお支払い方法。カードは Square が自動で書くのでここには出さない */
export const MANUAL_PAY_METHODS = ["現金", "振込"] as const;
export type ManualPayMethod = (typeof MANUAL_PAY_METHODS)[number];

/**
 * 手で記録できる科目。FRANK の mon_sales で実際に使われている区分に合わせる
 * （勝手な名前を増やすと事業別PLの内訳がその分だけ散らばる）。
 */
export const MANUAL_SALE_CATEGORIES = [
  "月会費",
  "入会金",
  "休会費",
  "利用料",
  "レッスン",
  "店内飲食",
  "販売",
] as const;
export type ManualSaleCategory = (typeof MANUAL_SALE_CATEGORIES)[number];

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 税込 → 税抜（10%・Square Webhook と同じ丸め） */
export function taxExcluded(taxIncluded: number): number {
  return Math.round(taxIncluded / 1.1);
}

export type ManualSaleInput = {
  /** 税込金額（円） */
  amountIncTax: unknown;
  /** お受けした日 "YYYY-MM-DD" */
  soldOn: unknown;
  category: unknown;
  payMethod: unknown;
  memo?: unknown;
  /** 何ヶ月分か（月会費のとき。領収書の但し書きに出る） */
  months?: unknown;
};

export type ManualSale = {
  amountIncTax: number;
  amountExTax: number;
  soldOn: string;
  category: ManualSaleCategory;
  payMethod: ManualPayMethod;
  memo: string | null;
  months: number | null;
};

/** 1円未満・100万円超は打ち間違いとして弾く（店頭で受け取る現金の現実的な上限） */
export const MANUAL_SALE_MAX = 1_000_000;

export function parseManualSale(
  input: ManualSaleInput,
  todayYmd: string,
): { ok: true; sale: ManualSale } | { ok: false; message: string } {
  const amountIncTax = Math.round(Number(String(input.amountIncTax ?? "").replace(/[,，\s]/g, "")));
  if (!Number.isFinite(amountIncTax) || amountIncTax <= 0) {
    return { ok: false, message: "金額を正しく入れてください（税込・1円以上）" };
  }
  if (amountIncTax > MANUAL_SALE_MAX) {
    return { ok: false, message: `金額が大きすぎます（${MANUAL_SALE_MAX.toLocaleString("ja-JP")}円まで）。桁を確かめてください` };
  }

  const soldOn = String(input.soldOn ?? "").trim();
  if (!YMD.test(soldOn)) return { ok: false, message: "お受けした日を入れてください" };
  if (soldOn > todayYmd) return { ok: false, message: "先の日付では記録できません（まだお受けしていないため）" };

  const category = String(input.category ?? "").trim();
  if (!MANUAL_SALE_CATEGORIES.includes(category as ManualSaleCategory)) {
    return { ok: false, message: "科目を選んでください" };
  }

  const payMethod = String(input.payMethod ?? "").trim();
  if (!MANUAL_PAY_METHODS.includes(payMethod as ManualPayMethod)) {
    return { ok: false, message: "お支払い方法は現金か振込を選んでください" };
  }

  const monthsRaw = Math.trunc(Number(input.months ?? 0));
  const months = category === "月会費" && monthsRaw > 1 && monthsRaw <= 24 ? monthsRaw : null;

  const memo = String(input.memo ?? "").trim().slice(0, 200) || null;

  return {
    ok: true,
    sale: {
      amountIncTax,
      amountExTax: taxExcluded(amountIncTax),
      soldOn,
      category: category as ManualSaleCategory,
      payMethod: payMethod as ManualPayMethod,
      memo,
      months,
    },
  };
}

/** mon_sales.memo に残す一行。あとから台帳を見た人に「誰がなぜ立てた行か」が分かるように */
export function manualSaleMemo(sale: ManualSale, memberNo: string | null, staffName: string): string {
  const who = staffName.trim() || "スタッフ";
  const no = memberNo ? `${memberNo}・` : "";
  const extra = sale.memo ? `／${sale.memo}` : "";
  return `${no}${sale.payMethod}でお受けした分（記録: ${who}）${extra}`;
}
