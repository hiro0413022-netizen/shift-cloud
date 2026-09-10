import "server-only";
import { createAdmin } from "@yozan/core/supabase/admin";
import {
  calcDailyPay,
  calcMonthlyPayroll,
  calcSlipTotals,
  calcItemBack,
  defaultRuleSet,
  type DailyPay,
  type ItemKind,
  type RuleSet,
  type SlipItemInput,
} from "@yozan/core/night-payroll";

/**
 * Night OS のデータ層。
 * 計算式はここに書かない — 金額はすべて @yozan/core/night-payroll に通す（正典を1つにする）。
 */

/** 当面は1店舗。member-os の resolveHimeji() と同じく店舗コードで引く */
export const NIGHT_STORE_CODE = "night-himeji";

export type NightStore = {
  id: string;
  companyId: string;
  name: string;
  openTime: string | null;
  closeTime: string | null;
};

export async function resolveNightStore(): Promise<NightStore | null> {
  const admin = createAdmin();
  const { data } = await admin
    .from("stores")
    .select("id, company_id, name, open_time, close_time")
    .eq("code", NIGHT_STORE_CODE)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    companyId: data.company_id as string,
    name: data.name as string,
    openTime: (data.open_time as string | null) ?? null,
    closeTime: (data.close_time as string | null) ?? null,
  };
}

/**
 * 営業日。夜の店は日付をまたぐので、朝6時までは前日の売上として数える。
 * （深夜2時の会計が翌日の売上になると、日報も日当も合わなくなる）
 */
export const BUSINESS_DAY_CUTOFF_HOUR = 6;

export function businessDate(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  if (jst.getUTCHours() < BUSINESS_DAY_CUTOFF_HOUR) jst.setUTCDate(jst.getUTCDate() - 1);
  return jst.toISOString().slice(0, 10);
}

export function monthStart(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

export function jstNow(): Date {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

// ============================================================
// バック設定
// ============================================================

export type ActiveRules = { id: string | null; businessType: RuleSet["businessType"]; rules: RuleSet };

export async function getActiveRules(storeId: string): Promise<ActiveRules> {
  const admin = createAdmin();
  const { data } = await admin
    .from("nite_rulesets")
    .select("id, business_type, rules")
    .eq("store_id", storeId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return { id: null, businessType: "cabaret", rules: defaultRuleSet("cabaret") };
  const stored = (data.rules ?? {}) as Partial<RuleSet>;
  const base = defaultRuleSet((data.business_type as RuleSet["businessType"]) ?? "cabaret");
  // 設定が途中までしか入っていなくても画面が壊れないよう、既定値の上に重ねる
  return {
    id: data.id as string,
    businessType: (data.business_type as RuleSet["businessType"]) ?? "cabaret",
    rules: { ...base, ...stored } as RuleSet,
  };
}

// ============================================================
// キャスト
// ============================================================

export type Cast = {
  id: string;
  name: string;
  displayName: string;
  rankName: string | null;
  hourlyWage: number;
  status: string;
};

export async function listCasts(storeId: string): Promise<Cast[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("nite_casts")
    .select("id, name, display_name, status, hourly_wage_override, nite_cast_ranks(name, hourly_wage, sort)")
    .eq("store_id", storeId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("display_name");
  type Row = {
    id: string;
    name: string;
    display_name: string;
    status: string;
    hourly_wage_override: number | null;
    nite_cast_ranks: { name: string; hourly_wage: number; sort: number } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    displayName: r.display_name,
    rankName: r.nite_cast_ranks?.name ?? null,
    hourlyWage: r.hourly_wage_override ?? r.nite_cast_ranks?.hourly_wage ?? 0,
    status: r.status,
  }));
}

// ============================================================
// フロア（卓一覧）
// ============================================================

export type SlipItemRow = {
  id: string;
  kind: ItemKind;
  label: string;
  unitPrice: number;
  qty: number;
  amount: number;
  castId: string | null;
  castName: string | null;
  backAmount: number;
  backBasisLabel: string | null;
  ruleRef: string | null;
  status: "active" | "void";
};

export type SlipRow = {
  id: string;
  tableId: string;
  tableCode: string;
  guests: number;
  openedAt: string;
  setMinutes: number;
  status: "open" | "closed" | "void";
  broughtByCastId: string | null;
  broughtByName: string | null;
  broughtKind: "douhan" | "referral" | "free" | null;
  items: SlipItemRow[];
  totals: ReturnType<typeof calcSlipTotals>;
  /** 担当キャストが入っていない明細の数。1件でもあると締められない */
  missingCastCount: number;
};

type RawItem = {
  id: string;
  kind: string;
  label: string;
  unit_price: number;
  qty: number;
  amount: number;
  cast_id: string | null;
  back_amount: number;
  back_basis: { label?: string } | null;
  rule_ref: string | null;
  status: string;
};

function toItems(raw: RawItem[], castNames: Map<string, string>): SlipItemRow[] {
  return raw.map((i) => ({
    id: i.id,
    kind: i.kind as ItemKind,
    label: i.label,
    unitPrice: i.unit_price,
    qty: i.qty,
    amount: i.amount,
    castId: i.cast_id,
    castName: i.cast_id ? (castNames.get(i.cast_id) ?? null) : null,
    backAmount: i.back_amount,
    backBasisLabel: i.back_basis?.label ?? null,
    ruleRef: i.rule_ref,
    status: i.status as "active" | "void",
  }));
}

function toCalcInput(items: SlipItemRow[]): SlipItemInput[] {
  return items.map((i) => ({
    kind: i.kind,
    amount: i.amount,
    qty: i.qty,
    castId: i.castId,
    drinkRuleId: i.ruleRef?.startsWith("drink:") ? i.ruleRef.slice(6) : null,
    status: i.status,
  }));
}

export type FloorTable = {
  id: string;
  code: string;
  kind: string;
  seats: number;
  slip: SlipRow | null;
};

export async function listFloor(storeId: string, rules: RuleSet, date: string): Promise<FloorTable[]> {
  const admin = createAdmin();
  const [{ data: tables }, { data: slips }, casts] = await Promise.all([
    admin
      .from("nite_tables")
      .select("id, code, kind, seats, sort")
      .eq("store_id", storeId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("sort")
      .order("code"),
    admin
      .from("nite_slips")
      .select(
        "id, table_id, guests, opened_at, set_minutes, status, brought_by_cast_id, brought_kind, " +
          "nite_slip_items(id, kind, label, unit_price, qty, amount, cast_id, back_amount, back_basis, rule_ref, status)"
      )
      .eq("store_id", storeId)
      .eq("status", "open")
      .is("deleted_at", null),
    listCasts(storeId),
  ]);
  void date;

  const castNames = new Map(casts.map((c) => [c.id, c.displayName]));
  const tableRows = (tables ?? []) as Array<{ id: string; code: string; kind: string; seats: number }>;
  const slipRows = (slips ?? []) as unknown as Array<{
    id: string;
    table_id: string;
    guests: number;
    opened_at: string;
    set_minutes: number;
    status: string;
    brought_by_cast_id: string | null;
    brought_kind: string | null;
    nite_slip_items: RawItem[];
  }>;

  const byTable = new Map<string, SlipRow>();
  for (const s of slipRows) {
    const items = toItems(s.nite_slip_items ?? [], castNames);
    byTable.set(s.table_id, {
      id: s.id,
      tableId: s.table_id,
      tableCode: tableRows.find((t) => t.id === s.table_id)?.code ?? "",
      guests: s.guests,
      openedAt: s.opened_at,
      setMinutes: s.set_minutes,
      status: s.status as SlipRow["status"],
      broughtByCastId: s.brought_by_cast_id,
      broughtByName: s.brought_by_cast_id ? (castNames.get(s.brought_by_cast_id) ?? null) : null,
      broughtKind: s.brought_kind as SlipRow["broughtKind"],
      items,
      totals: calcSlipTotals(rules, toCalcInput(items)),
      missingCastCount: items.filter(
        (i) =>
          i.status === "active" &&
          ["nomination", "inhouse_nomination", "douhan", "cast_drink", "bottle"].includes(i.kind) &&
          !i.castId
      ).length,
    });
  }

  return tableRows.map((t) => ({
    id: t.id,
    code: t.code,
    kind: t.kind,
    seats: t.seats,
    slip: byTable.get(t.id) ?? null,
  }));
}

export async function getSlip(slipId: string, rules: RuleSet): Promise<SlipRow | null> {
  const admin = createAdmin();
  const { data } = await admin
    .from("nite_slips")
    .select(
      "id, store_id, table_id, guests, opened_at, set_minutes, status, brought_by_cast_id, brought_kind, " +
        "nite_tables(code), " +
        "nite_slip_items(id, kind, label, unit_price, qty, amount, cast_id, back_amount, back_basis, rule_ref, status, created_at)"
    )
    .eq("id", slipId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    store_id: string;
    table_id: string;
    guests: number;
    opened_at: string;
    set_minutes: number;
    status: string;
    brought_by_cast_id: string | null;
    brought_kind: string | null;
    nite_tables: { code: string } | null;
    nite_slip_items: Array<RawItem & { created_at: string }>;
  };
  const casts = await listCasts(row.store_id);
  const castNames = new Map(casts.map((c) => [c.id, c.displayName]));
  const raw = [...(row.nite_slip_items ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const items = toItems(raw, castNames);
  return {
    id: row.id,
    tableId: row.table_id,
    tableCode: row.nite_tables?.code ?? "",
    guests: row.guests,
    openedAt: row.opened_at,
    setMinutes: row.set_minutes,
    status: row.status as SlipRow["status"],
    broughtByCastId: row.brought_by_cast_id,
    broughtByName: row.brought_by_cast_id ? (castNames.get(row.brought_by_cast_id) ?? null) : null,
    broughtKind: row.brought_kind as SlipRow["broughtKind"],
    items,
    totals: calcSlipTotals(rules, toCalcInput(items)),
    missingCastCount: items.filter(
      (i) =>
        i.status === "active" &&
        ["nomination", "inhouse_nomination", "douhan", "cast_drink", "bottle"].includes(i.kind) &&
        !i.castId
    ).length,
  };
}

// ============================================================
// 日当（1日分）
// ============================================================

export type CastDay = {
  cast: Cast;
  minutes: number;
  pay: DailyPay;
  broughtCustomer: boolean;
};

/**
 * その営業日の、出勤している全キャストの日当。
 * オーナー画面・キャスト画面・締めのどれもこの関数を通す（画面ごとに数字が割れないように）。
 */
export async function castDaysForStore(storeId: string, date: string, rules: RuleSet): Promise<CastDay[]> {
  const admin = createAdmin();
  const casts = await listCasts(storeId);

  const [{ data: atts }, { data: slips }, { data: advances }] = await Promise.all([
    admin
      .from("nite_attendances")
      .select("cast_id, minutes, hourly_wage_base")
      .eq("store_id", storeId)
      .eq("business_date", date)
      .is("deleted_at", null),
    admin
      .from("nite_slips")
      .select(
        "id, brought_by_cast_id, brought_kind, status, " +
          "nite_slip_items(kind, amount, qty, cast_id, rule_ref, status)"
      )
      .eq("store_id", storeId)
      .eq("business_date", date)
      .neq("status", "void")
      .is("deleted_at", null),
    admin
      .from("nite_advances")
      .select("cast_id")
      .eq("store_id", storeId)
      .eq("business_date", date)
      .in("status", ["requested", "paid"]),
  ]);

  const attMap = new Map(
    ((atts ?? []) as Array<{ cast_id: string; minutes: number; hourly_wage_base: number }>).map((a) => [a.cast_id, a])
  );
  const brought = new Set<string>();
  const itemsByCast = new Map<string, SlipItemInput[]>();
  for (const s of (slips ?? []) as unknown as Array<{
    brought_by_cast_id: string | null;
    brought_kind: string | null;
    nite_slip_items: Array<{ kind: string; amount: number; qty: number; cast_id: string | null; rule_ref: string | null; status: string }>;
  }>) {
    if (s.brought_by_cast_id && (s.brought_kind === "douhan" || s.brought_kind === "referral")) {
      brought.add(s.brought_by_cast_id);
    }
    for (const i of s.nite_slip_items ?? []) {
      if (!i.cast_id) continue;
      const list = itemsByCast.get(i.cast_id) ?? [];
      list.push({
        kind: i.kind as ItemKind,
        amount: i.amount,
        qty: i.qty,
        castId: i.cast_id,
        drinkRuleId: i.rule_ref?.startsWith("drink:") ? i.rule_ref.slice(6) : null,
        status: i.status as "active" | "void",
      });
      itemsByCast.set(i.cast_id, list);
    }
  }
  const advanceCount = new Map<string, number>();
  for (const a of (advances ?? []) as Array<{ cast_id: string }>) {
    advanceCount.set(a.cast_id, (advanceCount.get(a.cast_id) ?? 0) + 1);
  }

  return casts
    .map((cast) => {
      const att = attMap.get(cast.id);
      const minutes = att?.minutes ?? 0;
      const base = att?.hourly_wage_base || cast.hourlyWage;
      const items = itemsByCast.get(cast.id) ?? [];
      const broughtCustomer = brought.has(cast.id);
      return {
        cast,
        minutes,
        broughtCustomer,
        pay: calcDailyPay(rules, { baseHourlyWage: base, minutes, items, broughtCustomer, advanceCount: advanceCount.get(cast.id) ?? 0 }),
      };
    })
    .filter((d) => d.minutes > 0 || d.pay.backTotal > 0)
    .sort((a, b) => b.pay.net - a.pay.net);
}

export type DaySummary = {
  date: string;
  sales: number;
  groups: number;
  perGroup: number;
  openTables: number;
  guestsNow: number;
  laborCost: number;
  laborRate: number;
  missingCastSlips: number;
};

export async function daySummary(storeId: string, date: string, rules: RuleSet): Promise<DaySummary> {
  const admin = createAdmin();
  const { data: slips } = await admin
    .from("nite_slips")
    .select("id, status, guests, total, nite_slip_items(kind, amount, qty, cast_id, rule_ref, status)")
    .eq("store_id", storeId)
    .eq("business_date", date)
    .neq("status", "void")
    .is("deleted_at", null);

  const rows = (slips ?? []) as unknown as Array<{
    status: string;
    guests: number;
    total: number;
    nite_slip_items: Array<{ kind: string; amount: number; qty: number; cast_id: string | null; rule_ref: string | null; status: string }>;
  }>;

  let sales = 0;
  let openTables = 0;
  let guestsNow = 0;
  let missing = 0;
  for (const s of rows) {
    const items: SlipItemInput[] = (s.nite_slip_items ?? []).map((i) => ({
      kind: i.kind as ItemKind,
      amount: i.amount,
      qty: i.qty,
      castId: i.cast_id,
      status: i.status as "active" | "void",
    }));
    // 開いている卓は「今の伝票」を、閉じた卓は焼き付けた total を使う
    sales += s.status === "closed" ? s.total : calcSlipTotals(rules, items).total;
    if (s.status === "open") {
      openTables += 1;
      guestsNow += s.guests;
      const bad = (s.nite_slip_items ?? []).filter(
        (i) =>
          i.status === "active" &&
          ["nomination", "inhouse_nomination", "douhan", "cast_drink", "bottle"].includes(i.kind) &&
          !i.cast_id
      ).length;
      if (bad > 0) missing += 1;
    }
  }

  const days = await castDaysForStore(storeId, date, rules);
  const laborCost = days.reduce((s, d) => s + d.pay.net, 0);

  return {
    date,
    sales,
    groups: rows.length,
    perGroup: rows.length ? Math.round(sales / rows.length) : 0,
    openTables,
    guestsNow,
    laborCost,
    laborRate: sales ? Math.round((laborCost / sales) * 1000) / 10 : 0,
    missingCastSlips: missing,
  };
}

/** 明細1行を足したときのバックを出す（画面のプレビューと保存で同じ値を使う） */
export function previewBack(rules: RuleSet, item: SlipItemInput) {
  return calcItemBack(rules, item);
}

// ============================================================
// 月次（締め）
// ============================================================

export type MonthLine = {
  cast: Cast;
  line: ReturnType<typeof calcMonthlyPayroll>;
  days: Array<{ date: string; pay: DailyPay }>;
};

export function monthRange(month: string): { from: string; to: string } {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const from = `${month.slice(0, 7)}-01`;
  const end = new Date(Date.UTC(y, m, 0));
  const to = end.toISOString().slice(0, 10);
  return { from, to };
}

/**
 * 月次の給与行。
 * 日ごとに calcDailyPay を通してから calcMonthlyPayroll でまとめる。
 * 「日当の合計」と「月の支給額」が必ず一致するのは、同じ関数を通しているから。
 */
export async function castMonthLines(storeId: string, month: string, rules: RuleSet): Promise<MonthLine[]> {
  const admin = createAdmin();
  const { from, to } = monthRange(month);
  const casts = await listCasts(storeId);

  const [{ data: atts }, { data: slips }, { data: advances }, { data: adjustments }] = await Promise.all([
    admin
      .from("nite_attendances")
      .select("cast_id, business_date, minutes, hourly_wage_base")
      .eq("store_id", storeId)
      .gte("business_date", from)
      .lte("business_date", to)
      .is("deleted_at", null),
    admin
      .from("nite_slips")
      .select(
        "business_date, brought_by_cast_id, brought_kind, " +
          "nite_slip_items(kind, amount, qty, cast_id, rule_ref, status)"
      )
      .eq("store_id", storeId)
      .gte("business_date", from)
      .lte("business_date", to)
      .neq("status", "void")
      .is("deleted_at", null),
    admin
      .from("nite_advances")
      .select("cast_id, business_date, amount, fee")
      .eq("store_id", storeId)
      .gte("business_date", from)
      .lte("business_date", to)
      .in("status", ["requested", "paid"]),
    admin
      .from("nite_payroll_adjustments")
      .select("cast_id, amount, reason, nite_closings!inner(store_id, target_month)")
      .eq("nite_closings.store_id", storeId)
      .eq("nite_closings.target_month", from),
  ]);

  type Key = string; // `${castId}|${date}`
  const attMap = new Map<Key, { minutes: number; base: number }>();
  for (const a of (atts ?? []) as Array<{ cast_id: string; business_date: string; minutes: number; hourly_wage_base: number }>) {
    attMap.set(`${a.cast_id}|${a.business_date}`, { minutes: a.minutes, base: a.hourly_wage_base });
  }

  const itemMap = new Map<Key, SlipItemInput[]>();
  const broughtSet = new Set<Key>();
  for (const s of (slips ?? []) as unknown as Array<{
    business_date: string;
    brought_by_cast_id: string | null;
    brought_kind: string | null;
    nite_slip_items: Array<{ kind: string; amount: number; qty: number; cast_id: string | null; rule_ref: string | null; status: string }>;
  }>) {
    if (s.brought_by_cast_id && (s.brought_kind === "douhan" || s.brought_kind === "referral")) {
      broughtSet.add(`${s.brought_by_cast_id}|${s.business_date}`);
    }
    for (const i of s.nite_slip_items ?? []) {
      if (!i.cast_id) continue;
      const k = `${i.cast_id}|${s.business_date}`;
      const list = itemMap.get(k) ?? [];
      list.push({
        kind: i.kind as ItemKind,
        amount: i.amount,
        qty: i.qty,
        castId: i.cast_id,
        drinkRuleId: i.rule_ref?.startsWith("drink:") ? i.rule_ref.slice(6) : null,
        status: i.status as "active" | "void",
      });
      itemMap.set(k, list);
    }
  }

  const advanceByCast = new Map<string, number>();
  const advanceCountByKey = new Map<Key, number>();
  for (const a of (advances ?? []) as Array<{ cast_id: string; business_date: string; amount: number; fee: number }>) {
    advanceByCast.set(a.cast_id, (advanceByCast.get(a.cast_id) ?? 0) + a.amount);
    const k = `${a.cast_id}|${a.business_date}`;
    advanceCountByKey.set(k, (advanceCountByKey.get(k) ?? 0) + 1);
  }

  const adjByCast = new Map<string, Array<{ amount: number; reason: string }>>();
  for (const a of (adjustments ?? []) as unknown as Array<{ cast_id: string; amount: number; reason: string }>) {
    const list = adjByCast.get(a.cast_id) ?? [];
    list.push({ amount: a.amount, reason: a.reason });
    adjByCast.set(a.cast_id, list);
  }

  // その月の日付を全部作る（出勤が無い日は minutes=0 になるだけ）
  const dates: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  return casts
    .map((cast) => {
      const days = dates.map((date) => {
        const k = `${cast.id}|${date}`;
        const att = attMap.get(k);
        return {
          date,
          pay: calcDailyPay(rules, {
            baseHourlyWage: att?.base || cast.hourlyWage,
            minutes: att?.minutes ?? 0,
            items: itemMap.get(k) ?? [],
            broughtCustomer: broughtSet.has(k),
            advanceCount: advanceCountByKey.get(k) ?? 0,
          }),
        };
      });
      const line = calcMonthlyPayroll(rules, {
        days: days.map((d) => ({ businessDate: d.date, pay: d.pay })),
        advanceTotal: advanceByCast.get(cast.id) ?? 0,
        adjustments: adjByCast.get(cast.id) ?? [],
      });
      return { cast, line, days: days.filter((d) => d.pay.minutes > 0 || d.pay.backTotal > 0) };
    })
    .filter((r) => r.line.workDays > 0 || r.line.backTotal > 0 || r.line.advanceTotal > 0)
    .sort((a, b) => b.line.net - a.line.net);
}
