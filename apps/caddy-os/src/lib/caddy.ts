import "server-only";
import { createAdmin } from "@yozan/core/supabase/admin";

/* ============================================================
   Caddy OS のドメインロジック（DECISIONS #45 / migration 0036）

   1派遣 = 1行（cad_dispatches）。売上（取引先へ請求）と原価（委託先へ支払）を
   同じ行に持つので、粗利が行単位で出る。

   原価の扱いで最も大事なルール:
     - 委託先（partner）… fee + transport + special が「外注費」
     - 社員（staff / 林さん）… 委託料は発生しない。交通費も給与で支給されるため
       **外注費に入れない**（Excel運用ではここが二重計上の温床だった）
   ============================================================ */

/**
 * 派遣シフトの状態・表示ラベル・型は lib/shift.ts（クライアント共用）に置き、ここから再輸出する。
 * このファイルは "server-only" なので、カレンダー等のクライアント側から直接は読めないため。
 */
export {
  STATUS_LABEL,
  STATUS_TONE,
  isBillable,
  kindLabel,
} from "./shift";
export type {
  AvailabilityStatus,
  BoardAvailability,
  BoardDispatch,
  DispatchStatus,
  MonthBoard,
} from "./shift";

import { isBillable, type BoardAvailability, type BoardDispatch, type DispatchStatus, type MonthBoard } from "./shift";

export type DispatchRow = {
  id: string;
  seq: string | null;
  dispatch_date: string;
  kind: string;
  status: DispatchStatus;
  sales_amount: number;
  fee_amount: number;
  transport_amount: number;
  special_amount: number;
  work_hours: number | null;
  memo: string | null;
  billing_ym: string | null;
  client_id: string | null;
  partner_id: string | null;
  staff_id: string | null;
  cad_clients: { name: string } | null;
  cad_partners: { name: string } | null;
  staff: { name: string } | null;
};

export type MonthSummary = {
  month: string;
  dispatches: number;   // 人工数（売上が立つ派遣の件数）
  sales: number;
  outsourcing: number;  // 外注費（委託先分のみ）
  gross: number;        // 売上 - 外注費（※社員の人件費は給与側なので含まない）
  grossRate: number;
};

/** その派遣の原価（外注費）。社員の派遣は 0（人件費は給与側 / #44） */
export function dispatchCost(d: {
  partner_id: string | null;
  fee_amount: number;
  transport_amount: number;
  special_amount: number;
}): number {
  if (!d.partner_id) return 0;
  return d.fee_amount + d.transport_amount + d.special_amount;
}

export function ymRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

export function currentYm(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function yen(n: number): string {
  return `¥${Math.round(n).toLocaleString("ja-JP")}`;
}

export async function getDispatches(companyId: string, ym: string): Promise<DispatchRow[]> {
  const admin = createAdmin();
  const { from, to } = ymRange(ym);
  const { data } = await admin
    .from("cad_dispatches")
    .select(
      "id, seq, dispatch_date, kind, status, sales_amount, fee_amount, transport_amount, special_amount, work_hours, memo, billing_ym, client_id, partner_id, staff_id, cad_clients(name), cad_partners(name), staff(name)"
    )
    .eq("company_id", companyId)
    .gte("dispatch_date", from)
    .lte("dispatch_date", to)
    .is("deleted_at", null)
    .order("dispatch_date", { ascending: true });
  return (data ?? []) as unknown as DispatchRow[];
}

export function summarize(rows: DispatchRow[], month: string): MonthSummary {
  let sales = 0;
  let outsourcing = 0;
  let dispatches = 0;
  for (const r of rows.filter(isBillable)) {
    sales += r.sales_amount;
    outsourcing += dispatchCost(r);
    if (r.sales_amount > 0) dispatches += 1;
  }
  const gross = sales - outsourcing;
  return {
    month,
    dispatches,
    sales,
    outsourcing,
    gross,
    grossRate: sales > 0 ? (gross / sales) * 100 : 0,
  };
}

/** 取引先別（請求のもと）: 件数・売上 */
export function byClient(rows: DispatchRow[]) {
  const m = new Map<string, { name: string; count: number; sales: number }>();
  for (const r of rows.filter(isBillable)) {
    if (!r.client_id || r.sales_amount <= 0) continue;
    const cur = m.get(r.client_id) ?? { name: r.cad_clients?.name ?? "（不明）", count: 0, sales: 0 };
    cur.count += 1;
    cur.sales += r.sales_amount;
    m.set(r.client_id, cur);
  }
  return [...m.values()].sort((a, b) => b.sales - a.sales);
}

/** 委託先別（支払のもと）: 件数・委託料・交通費・特別手当・合計 */
export function byPartner(rows: DispatchRow[]) {
  const m = new Map<
    string,
    { name: string; count: number; fee: number; transport: number; special: number; total: number }
  >();
  for (const r of rows.filter(isBillable)) {
    if (!r.partner_id) continue;
    const cur =
      m.get(r.partner_id) ??
      { name: r.cad_partners?.name ?? "（不明）", count: 0, fee: 0, transport: 0, special: 0, total: 0 };
    cur.count += 1;
    cur.fee += r.fee_amount;
    cur.transport += r.transport_amount;
    cur.special += r.special_amount;
    cur.total += dispatchCost(r);
    m.set(r.partner_id, cur);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

/**
 * 派遣台帳（一括入力）で使うマスタ。
 * - 委託先は show_in_picker=true のみ（退職・休眠キャディはプルダウンから隠す / #62 ④）
 * - clients に partner_fee（ゴルフ場ごとの委託料 / #62 ③）を含める
 * - transportRates は「clientId__partnerId → 交通費」（#62 ②）。ゴルフ場×キャディで自動入力する
 */
/**
 * 自社スタッフ別の交通費（給与で精算する分 / #62 林さん対応）。
 * 社員の交通費は外注費に入れず給与側で精算するため、給与担当へ渡す月次合計をここで出す。
 */
export function byStaff(rows: DispatchRow[]) {
  const m = new Map<string, { name: string; count: number; transport: number }>();
  for (const r of rows.filter(isBillable)) {
    if (!r.staff_id) continue;
    const cur = m.get(r.staff_id) ?? { name: r.staff?.name ?? "（不明）", count: 0, transport: 0 };
    cur.count += 1;
    cur.transport += r.transport_amount;
    m.set(r.staff_id, cur);
  }
  return [...m.values()].sort((a, b) => b.transport - a.transport);
}

export async function getMasters(companyId: string) {
  const admin = createAdmin();
  const [{ data: clients }, { data: partners }, { data: staff }, { data: rates }] = await Promise.all([
    admin
      .from("cad_clients")
      .select("id, name, unit_price, partner_fee, closing_day, payment_day")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .eq("status", "active")
      .order("name"),
    admin
      .from("cad_partners")
      .select("id, name, default_fee, default_transport, hourly_wage")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .eq("status", "active")
      .eq("show_in_picker", true)
      .order("name"),
    admin.from("staff").select("id, name").eq("company_id", companyId).is("deleted_at", null).order("name"),
    admin
      .from("cad_transport_rates")
      .select("client_id, partner_id, staff_id, amount")
      .eq("company_id", companyId)
      .is("deleted_at", null),
  ]);
  // 委託先(partner_id)・社員(staff_id) どちらの単価も同じマップに入れる（idはUUIDで衝突しない）
  const transportRates: Record<string, number> = {};
  for (const r of (rates ?? []) as Array<{ client_id: string; partner_id: string | null; staff_id: string | null; amount: number }>) {
    const ref = r.partner_id ?? r.staff_id;
    if (ref) transportRates[`${r.client_id}__${ref}`] = r.amount;
  }
  return {
    clients: (clients ?? []) as Array<{
      id: string;
      name: string;
      unit_price: number | null;
      partner_fee: number | null;
      closing_day: string | null;
      payment_day: string | null;
    }>,
    partners: (partners ?? []) as Array<{
      id: string;
      name: string;
      default_fee: number | null;
      default_transport: number;
      hourly_wage: number | null;
    }>,
    staff: (staff ?? []) as Array<{ id: string; name: string }>,
    transportRates,
  };
}

/** 直近6ヶ月の推移（ダッシュボードの折れ線代わり） */
export async function getTrend(companyId: string, months = 6) {
  const admin = createAdmin();
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const { data } = await admin
    .from("cad_dispatches")
    .select("dispatch_date, sales_amount, fee_amount, transport_amount, special_amount, partner_id")
    .eq("company_id", companyId)
    .eq("status", "confirmed")
    .gte("dispatch_date", start.toISOString().slice(0, 10))
    .is("deleted_at", null);

  const m = new Map<string, { sales: number; cost: number; count: number }>();
  for (const r of (data ?? []) as Array<{
    dispatch_date: string;
    sales_amount: number;
    fee_amount: number;
    transport_amount: number;
    special_amount: number;
    partner_id: string | null;
  }>) {
    const key = r.dispatch_date.slice(0, 7);
    const cur = m.get(key) ?? { sales: 0, cost: 0, count: 0 };
    cur.sales += r.sales_amount;
    cur.cost += dispatchCost(r);
    if (r.sales_amount > 0) cur.count += 1;
    m.set(key, cur);
  }
  return [...m.entries()]
    .map(([month, v]) => ({ month, ...v, gross: v.sales - v.cost }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));
}

/* ============================================================
   シフトカレンダー / 台帳 / ゴルフ場提出（DECISIONS #140 / migration 0118）

   小川さん依頼の要点は「同じ情報を何度も入力しない」こと。
   そのため **元データは cad_dispatches ただ1つ** にして、
   カレンダー・キャディ台帳・ゴルフ場提出CSV・請求・財務は全部ここから生成する。
   新しいテーブルは足していない（＝二重入力も同期ズレも構造的に起きない）。
   ============================================================ */

/** 月間カレンダーの元データを1往復で取る（派遣＋出勤希望） */
export async function getMonthBoard(companyId: string, ym: string): Promise<MonthBoard> {
  const admin = createAdmin();
  const { from, to } = ymRange(ym);

  const [{ data: ds }, { data: av }] = await Promise.all([
    admin
      .from("cad_dispatches")
      .select(
        "id, dispatch_date, status, kind, client_id, partner_id, staff_id, sales_amount, fee_amount, transport_amount, special_amount, memo, cad_clients(name), cad_partners(name), staff(name)"
      )
      .eq("company_id", companyId)
      .gte("dispatch_date", from)
      .lte("dispatch_date", to)
      .is("deleted_at", null)
      .order("dispatch_date"),
    admin
      .from("cad_availability")
      .select("partner_id, date, status, memo, source")
      .eq("company_id", companyId)
      .gte("date", from)
      .lte("date", to)
      .is("deleted_at", null),
  ]);

  type Raw = {
    id: string;
    dispatch_date: string;
    status: DispatchStatus;
    kind: string;
    client_id: string | null;
    partner_id: string | null;
    staff_id: string | null;
    sales_amount: number;
    fee_amount: number;
    transport_amount: number;
    special_amount: number;
    memo: string | null;
    cad_clients: { name: string } | null;
    cad_partners: { name: string } | null;
    staff: { name: string } | null;
  };

  const dispatches = ((ds ?? []) as unknown as Raw[]).map((r) => ({
    id: r.id,
    dispatch_date: r.dispatch_date,
    status: r.status,
    kind: r.kind,
    client_id: r.client_id,
    client_name: r.kind === "golfwing" ? "ゴルフウィング" : (r.cad_clients?.name ?? null),
    partner_id: r.partner_id,
    staff_id: r.staff_id,
    caddie_name: r.cad_partners?.name ?? r.staff?.name ?? "（未割当）",
    sales_amount: r.sales_amount,
    fee_amount: r.fee_amount,
    transport_amount: r.transport_amount,
    special_amount: r.special_amount,
    memo: r.memo,
  }));

  const lastDay = Number(to.slice(-2));
  return {
    ym,
    days: Array.from({ length: lastDay }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`),
    dispatches,
    availability: (av ?? []) as BoardAvailability[],
  };
}

/** キャディ台帳（1人分の勤務履歴）。確定・仮を両方返し、画面で区別して見せる */
export async function getPartnerLedger(companyId: string, partnerId: string, ym: string) {
  const admin = createAdmin();
  const { from, to } = ymRange(ym);
  const { data } = await admin
    .from("cad_dispatches")
    .select(
      "id, dispatch_date, status, kind, sales_amount, fee_amount, transport_amount, special_amount, work_hours, memo, cad_clients(name)"
    )
    .eq("company_id", companyId)
    .eq("partner_id", partnerId)
    .gte("dispatch_date", from)
    .lte("dispatch_date", to)
    .is("deleted_at", null)
    .order("dispatch_date");

  type Raw = {
    id: string;
    dispatch_date: string;
    status: DispatchStatus;
    kind: string;
    sales_amount: number;
    fee_amount: number;
    transport_amount: number;
    special_amount: number;
    work_hours: number | null;
    memo: string | null;
    cad_clients: { name: string } | null;
  };
  return ((data ?? []) as unknown as Raw[]).map((r) => ({
    ...r,
    client_name: r.kind === "golfwing" ? "ゴルフウィング" : (r.cad_clients?.name ?? "—"),
    pay: r.fee_amount + r.transport_amount + r.special_amount,
  }));
}
