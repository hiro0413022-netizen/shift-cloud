import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import { jstYmd } from "@/lib/jst";
import type { InventoryActor } from "@/lib/auth";
import { signedQty, type MovementKind } from "@/lib/inventory-calc";

// 純粋計算は inventory-calc.ts（server-onlyを付けていない＝テストから直接importできる）
export {
  MOVEMENT_LABEL,
  OUTBOUND_KINDS,
  signedQty,
  theoreticalQty,
  needsReorder,
  cogs,
  yen,
  groupByLocation,
  NO_LOCATION,
  type MovementKind,
} from "@/lib/inventory-calc";

// ============================================================
// 型
// ============================================================

export type Stock = {
  item_id: string;
  code: string;
  category: string;
  maker: string;
  name: string;
  spec: string | null;
  variant: string | null;
  unit: string;
  location1: string | null;
  location2: string | null;
  list_price: number | null;
  cost_price: number | null;
  reorder_point: number | null;
  status: "active" | "discontinued";
  base_on: string | null;
  base_qty: number;
  qty: number;
  delta_since: number;
  value: number;
  needs_reorder: boolean;
};

export type CountSession = {
  id: string;
  store_id: string | null;
  counted_on: string;
  label: string | null;
  status: "open" | "closed";
  closed_at: string | null;
  total_qty: number;
  total_value: number;
  note: string | null;
};

export type CountRow = {
  item_id: string;
  qty: number;
  theoretical: number | null;
  diff: number | null;
  counted_by_name: string | null;
  memo: string | null;
};

// ============================================================
// 参照
// ============================================================

/** 理論在庫（inv_stock ビュー）。location でグルーピングしやすい順に返す */
export async function listStock(
  companyId: string,
  opts: { storeId?: string | null; includeDiscontinued?: boolean } = {}
): Promise<Stock[]> {
  const admin = createAdmin();
  let q = admin.from("inv_stock").select("*").eq("company_id", companyId);
  if (opts.storeId) q = q.eq("store_id", opts.storeId);
  if (!opts.includeDiscontinued) q = q.eq("status", "active");
  const { data } = await q.order("code");
  return (data ?? []) as Stock[];
}

export async function listSessions(companyId: string, limit = 24): Promise<CountSession[]> {
  const admin = createAdmin();
  const { data } = await admin
    .from("inv_count_sessions")
    .select("id, store_id, counted_on, label, status, closed_at, total_qty, total_value, note")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("counted_on", { ascending: false })
    .limit(limit);
  return (data ?? []) as CountSession[];
}

export async function getSession(companyId: string, id: string): Promise<CountSession | null> {
  const admin = createAdmin();
  const { data } = await admin
    .from("inv_count_sessions")
    .select("id, store_id, counted_on, label, status, closed_at, total_qty, total_value, note")
    .eq("company_id", companyId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as CountSession) ?? null;
}

/** 開いている棚卸。無ければ null（＝「棚卸をはじめる」ボタンを出す） */
export async function getOpenSession(companyId: string, storeId: string | null): Promise<CountSession | null> {
  const admin = createAdmin();
  let q = admin
    .from("inv_count_sessions")
    .select("id, store_id, counted_on, label, status, closed_at, total_qty, total_value, note")
    .eq("company_id", companyId)
    .eq("status", "open")
    .is("deleted_at", null);
  q = storeId ? q.eq("store_id", storeId) : q.is("store_id", null);
  const { data } = await q.order("counted_on", { ascending: false }).limit(1).maybeSingle();
  return (data as CountSession) ?? null;
}

export async function listCounts(sessionId: string): Promise<Map<string, CountRow>> {
  const admin = createAdmin();
  const { data } = await admin
    .from("inv_counts")
    .select("item_id, qty, theoretical, diff, counted_by_name, memo")
    .eq("session_id", sessionId);
  const m = new Map<string, CountRow>();
  for (const r of (data ?? []) as CountRow[]) m.set(r.item_id, r);
  return m;
}

/** 直前に確定した棚卸の数量（「前回と同じ」ボタンの元になる値） */
export async function lastClosedQty(
  companyId: string,
  storeId: string | null,
  beforeOn: string
): Promise<Map<string, number>> {
  const admin = createAdmin();
  let sq = admin
    .from("inv_count_sessions")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "closed")
    .lt("counted_on", beforeOn)
    .is("deleted_at", null);
  sq = storeId ? sq.eq("store_id", storeId) : sq.is("store_id", null);
  const { data: sess } = await sq.order("counted_on", { ascending: false }).limit(1).maybeSingle();
  const out = new Map<string, number>();
  if (!sess) return out;
  const { data } = await admin.from("inv_counts").select("item_id, qty").eq("session_id", (sess as { id: string }).id);
  for (const r of (data ?? []) as Array<{ item_id: string; qty: number }>) out.set(r.item_id, r.qty);
  return out;
}

// ============================================================
// 更新
// ============================================================

/** 棚卸をはじめる。同じ基準日のものがあればそれを返す（二重作成の防止） */
export async function openCountSession(
  actor: InventoryActor,
  storeId: string | null,
  countedOn?: string
): Promise<{ id: string } | { error: string }> {
  const admin = createAdmin();
  const on = countedOn ?? jstYmd(); // 「今日」はJSTで解決する（#73）
  const label = `${on.slice(0, 4)}年${Number(on.slice(5, 7))}月 棚卸`;

  const { data: existing } = await admin
    .from("inv_count_sessions")
    .select("id, status")
    .eq("company_id", actor.companyId)
    .eq("counted_on", on)
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) {
    if ((existing as { status: string }).status === "closed") {
      return { error: `${on} の棚卸はすでに確定済みです` };
    }
    return { id: (existing as { id: string }).id };
  }

  const { data, error } = await admin
    .from("inv_count_sessions")
    .insert({ company_id: actor.companyId, store_id: storeId, counted_on: on, label })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: (data as { id: string }).id };
}

/** カウントの保存。1品番＝1行のupsert（同じ品番を二人が同時に触っても最後の値で確定する） */
export async function saveCount(
  actor: InventoryActor,
  sessionId: string,
  itemId: string,
  qty: number
): Promise<{ error?: string }> {
  if (!Number.isInteger(qty) || qty < 0) return { error: "数量は0以上の整数で入力してください" };
  const admin = createAdmin();
  const { error } = await admin.from("inv_counts").upsert(
    {
      company_id: actor.companyId,
      session_id: sessionId,
      item_id: itemId,
      qty,
      counted_at: new Date().toISOString(),
      counted_by: actor.staffId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "session_id,item_id" }
  );
  return error ? { error: error.message } : {};
}

/** 未入力の品番に前回の数量をまとめて入れる。「変わっていないものは触らない」運用の要 */
export async function carryOverUnfilled(
  actor: InventoryActor,
  session: CountSession,
  itemIds: string[]
): Promise<{ filled: number; error?: string }> {
  const prev = await lastClosedQty(actor.companyId, session.store_id, session.counted_on);
  const already = await listCounts(session.id);
  const rows = itemIds
    .filter((id) => !already.has(id))
    .map((id) => ({
      company_id: actor.companyId,
      session_id: session.id,
      item_id: id,
      qty: prev.get(id) ?? 0, // 前回に無い品番＝新規登録品は0スタート
      counted_at: new Date().toISOString(),
      counted_by: actor.staffId,
    }));
  if (rows.length === 0) return { filled: 0 };
  const admin = createAdmin();
  const { error } = await admin.from("inv_counts").upsert(rows, { onConflict: "session_id,item_id" });
  return error ? { filled: 0, error: error.message } : { filled: rows.length };
}

/** 棚卸の確定。差異をinv_movementsにadjustとして起票するのはDB関数側（0086） */
export async function closeCountSession(
  actor: InventoryActor,
  sessionId: string
): Promise<{ adjusted: number; total_qty: number; total_value: number } | { error: string }> {
  const admin = createAdmin();
  const { data, error } = await admin.rpc("inv_close_count", {
    p_session_id: sessionId,
    p_staff_id: actor.staffId,
  });
  if (error) return { error: error.message };
  return data as { adjusted: number; total_qty: number; total_value: number };
}

/** 入出庫の手動記録。出庫種別なら符号を自動でマイナスにする */
export async function addMovement(
  actor: InventoryActor,
  input: {
    itemId: string;
    storeId: string | null;
    kind: MovementKind;
    qty: number;
    occurredOn?: string;
    memo?: string | null;
    unitCost?: number | null;
  }
): Promise<{ error?: string }> {
  const signed = signedQty(input.kind, input.qty);
  if (signed === 0) return { error: "数量に0は指定できません" };
  const admin = createAdmin();
  const { error } = await admin.from("inv_movements").insert({
    company_id: actor.companyId,
    item_id: input.itemId,
    store_id: input.storeId,
    occurred_on: input.occurredOn ?? jstYmd(),
    kind: input.kind,
    qty: signed,
    unit_cost: input.unitCost ?? null,
    source_app: "inventory-os",
    memo: input.memo ?? null,
    created_by: actor.staffId,
  });
  return error ? { error: error.message } : {};
}

/** 新規品番。管理番号はDB関数で採番する（同時登録の衝突を防ぐ） */
export async function createItem(
  actor: InventoryActor,
  input: {
    category: string;
    maker: string;
    name: string;
    spec?: string | null;
    variant?: string | null;
    unit?: string;
    location1?: string | null;
    location2?: string | null;
    listPrice?: number | null;
    costPrice?: number | null;
    reorderPoint?: number | null;
    storeId?: string | null;
  }
): Promise<{ code: string } | { error: string }> {
  const admin = createAdmin();
  const { data: code, error: codeErr } = await admin.rpc("inv_next_code", {
    p_company_id: actor.companyId,
    p_category: input.category,
    p_maker: input.maker,
  });
  if (codeErr) return { error: codeErr.message };

  const { error } = await admin.from("inv_items").insert({
    company_id: actor.companyId,
    store_id: input.storeId ?? null,
    code,
    category: input.category,
    maker: input.maker,
    name: input.name,
    spec: input.spec ?? null,
    variant: input.variant ?? null,
    unit: input.unit || "個",
    location1: input.location1 ?? null,
    location2: input.location2 ?? null,
    list_price: input.listPrice ?? null,
    cost_price: input.costPrice ?? null,
    reorder_point: input.reorderPoint ?? null,
  });
  if (error) return { error: error.message };
  return { code: code as string };
}
