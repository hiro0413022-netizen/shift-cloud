/**
 * 領収書の文言（#222）。DBに触らない部分だけを分けてある（テストから読めるように）。
 */

export type SaleRow = {
  id: string;
  sold_on: string;
  category: string;
  amount_inc_tax: number;
  pay_method: string | null;
  months: number | null;
};

/** 明細1行の名前。「月会費（2ヶ月分）」のように、何のお金かが領収書だけで分かるようにする */
export function saleLabel(r: SaleRow, planName?: string | null): string {
  const base = r.category || "ご利用料金";
  const plan = planName ? `${planName}・` : "";
  if (r.category === "月会費" && r.months && r.months > 1) return `${base}（${plan}${r.months}ヶ月分）`;
  if (r.category === "月会費") return `${base}（${plan}${monthOf(r.sold_on)}分）`;
  return plan ? `${base}（${planName}）` : base;
}

function monthOf(ymd: string): string {
  const [y, m] = ymd.split("-");
  return `${y}年${Number(m)}月`;
}

/** 領収書番号。同じ入金の組み合わせなら毎回同じ番号になる（再発行しても番号が増えない） */
export function receiptNo(memberNo: string | null, saleIds: string[]): string {
  const head = (memberNo ?? "FR----").replace(/[^A-Za-z0-9]/g, "");
  const tail = saleIds
    .map((s) => s.slice(0, 4))
    .sort()
    .join("");
  return `${head}-${tail}`.toUpperCase().slice(0, 24);
}
