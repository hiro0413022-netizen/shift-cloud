/* ============================================================
   請求書のロジック（DECISIONS #46 / migration 0037）
   ※ DBアクセス禁止の純粋関数のみ（tests/caddy-invoice.test.ts から直接importする）

   実物の請求書（2026年6月・加古川ゴルフ倶楽部）から確定した仕様:
     明細  = 「キャディ業務料（YYYY年M月D日 分）」× 数量（その日の人工数）× 単価
     小計  = Σ 明細金額（税抜）
     税額  = floor(小計 × 10%)
     合計  = 小計 + 税額（外税）
   締切日は取引先ごと（月末 / 20日締め）。
   ============================================================ */

export type InvoiceLineSource = {
  dispatch_date: string; // YYYY-MM-DD
  sales_amount: number;  // 税抜（円）
};

export type InvoiceLine = {
  date: string;
  label: string;
  qty: number;
  unit_price: number;
  amount: number;
};

export type Invoice = {
  lines: InvoiceLine[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  closingDate: string; // YYYY-MM-DD
};

/** 月末日（YYYY-MM-DD） */
export function lastDayOf(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(last).padStart(2, "0")}`;
}

/**
 * 締切日。取引先マスタの closing_day（'月末' / '２０日締め' 等）から決める。
 * 全角数字・「日締め」などの表記ゆれを吸収する（Excel由来のため）。
 */
export function closingDateOf(ym: string, closingDay: string | null | undefined): string {
  const raw = (closingDay ?? "").trim();
  if (!raw) return lastDayOf(ym);
  // 全角→半角
  const normalized = raw.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const m = normalized.match(/(\d{1,2})\s*日/);
  if (m) {
    const day = Number(m[1]);
    const last = Number(lastDayOf(ym).slice(-2));
    if (day >= 1 && day < last) return `${ym}-${String(day).padStart(2, "0")}`;
  }
  return lastDayOf(ym);
}

/** 「2026年6月7日」表記（請求書の明細ラベル用。0埋めしない） */
export function jpDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}年 ${m}月${d}日`;
}

/**
 * 派遣行 → 請求書。同じ日・同じ単価の派遣をまとめて1明細にする（実物の請求書と同じ形）。
 * 売上0の行（研修・自社負担）は請求対象外。
 */
export function buildInvoice(
  rows: InvoiceLineSource[],
  ym: string,
  closingDay: string | null | undefined,
  taxRate = 0.1,
  itemLabel = "キャディ業務料"
): Invoice {
  const byKey = new Map<string, InvoiceLine>();
  for (const r of rows) {
    if (r.sales_amount <= 0) continue;
    const key = `${r.dispatch_date}|${r.sales_amount}`;
    const cur =
      byKey.get(key) ??
      {
        date: r.dispatch_date,
        label: `${itemLabel} (${jpDate(r.dispatch_date)} 分）`,
        qty: 0,
        unit_price: r.sales_amount,
        amount: 0,
      };
    cur.qty += 1;
    cur.amount = cur.qty * cur.unit_price;
    byKey.set(key, cur);
  }

  const lines = [...byKey.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.unit_price - b.unit_price
  );
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const tax = Math.floor(subtotal * taxRate);

  return {
    lines,
    subtotal,
    taxRate,
    tax,
    total: subtotal + tax,
    closingDate: closingDateOf(ym, closingDay),
  };
}

/** 請求番号: 2026-06-G0002（対象月 + 取引先コード） */
export function invoiceNo(ym: string, clientCode: string | null | undefined, clientName: string): string {
  const code = (clientCode ?? "").replace(/-/g, "") || clientName.slice(0, 4);
  return `${ym}-${code}`;
}

export function yen(n: number): string {
  return Math.round(n).toLocaleString("ja-JP");
}

/* ============================================================
   キャディ → YOZAN の請求書（支払 / DECISIONS #62 ①）
   ※ DBアクセス禁止の純粋関数（tests から直接importする）

   委託先キャディが YOZAN へ月次で上げる請求書。中身は当月の:
     - 派遣（kind='dispatch'/'training'/'other'）… 委託料 + 交通費 + 特別手当
     - ゴルフウィング勤務（kind='golfwing'）……… 時間数 × 時給（fee_amount に格納済み）
   消費税は**なし（免税事業者）**で合計する（ユーザー決定 2026-07-24）。
   ============================================================ */

export type PayableSource = {
  dispatch_date: string;
  kind: string;
  client_name: string | null;
  fee_amount: number;
  transport_amount: number;
  special_amount: number;
  work_hours: number | null;
};

export type PayableLine = {
  date: string;
  label: string;      // 例: 「加古川ゴルフ倶楽部 キャディ業務」/「ゴルフウィング 勤務（5.0h）」
  fee: number;        // 委託料（golfwing は時給×時間）
  transport: number;
  special: number;
  amount: number;     // fee + transport + special
};

export type PayableInvoice = {
  lines: PayableLine[];
  fee: number;
  transport: number;
  special: number;
  total: number;      // 免税のため税額なし
};

/** 派遣行 → 支払請求書（1日1コース1行）。日付昇順・ゴルフウィングは末尾寄り */
export function buildPayable(rows: PayableSource[]): PayableInvoice {
  const lines: PayableLine[] = rows.map((r) => {
    const isGw = r.kind === "golfwing";
    const label = isGw
      ? `ゴルフウィング 勤務${r.work_hours ? `（${r.work_hours}h）` : ""}`
      : `${r.client_name ?? "業務"} キャディ業務`;
    const amount = r.fee_amount + r.transport_amount + r.special_amount;
    return {
      date: r.dispatch_date,
      label,
      fee: r.fee_amount,
      transport: r.transport_amount,
      special: r.special_amount,
      amount,
    };
  });
  lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const fee = lines.reduce((s, l) => s + l.fee, 0);
  const transport = lines.reduce((s, l) => s + l.transport, 0);
  const special = lines.reduce((s, l) => s + l.special, 0);
  return { lines, fee, transport, special, total: fee + transport + special };
}

/** 支払請求番号: 2026-06-P-C001（対象月 + P + 委託先コード） */
export function payableNo(ym: string, partnerCode: string | null | undefined, partnerName: string): string {
  const code = (partnerCode ?? "").replace(/-/g, "") || partnerName.slice(0, 4);
  return `${ym}-P-${code}`;
}
