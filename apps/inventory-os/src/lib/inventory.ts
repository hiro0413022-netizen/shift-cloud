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
  /** 店舗（null = 未設定。0086時点の移行データは全部これ）#134 */
  store_id: string | null;
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
// 店舗スコープ（#134 / DECISIONS #128「店舗またぎ廃止」）
// ============================================================

/**
 * FRANK GOLF 姫路の店舗ID（genesis / lesson-os と同じ定数）。
 * 「store_id 未設定の在庫をどちらの店舗のものと見なすか」を決めるためだけに使う。
 */
const FRANK_STORE_ID = "b54afb9f-22aa-4f4e-b758-bc2157acfdd5";

/** storeIds が null＝全店（オーナー）。includeUnassigned＝store_id 未設定の行を含めるか */
export type StoreScope = { storeIds: string[] | null; includeUnassigned: boolean };

/**
 * その人が見てよい在庫の範囲（#134）。
 *
 * inv_* の store_id は 0086 の時点で nullable のまま入り、エクセルから移行した
 * 362品番は全部 未設定（＝実体は GOLF WING 宝塚の棚）。
 * 「未設定＝自店舗」と見なすと FRANK GOLF から宝塚の在庫が丸見えになるため、
 * 未設定行は FRANK 以外の店舗に配属されている人にだけ見せる。
 * 恒久対応は store_id のバックフィル＋NOT NULL 化（要マイグレーション 0112）。
 */
export function storeScopeOf(actor: InventoryActor): StoreScope {
  if (actor.isOwner) return { storeIds: null, includeUnassigned: true };
  return {
    storeIds: actor.storeIds,
    includeUnassigned: actor.storeIds.some((id) => id !== FRANK_STORE_ID),
  };
}

/** 棚卸セッション等「その行の店舗」だけを対象にするスコープ */
export function scopeOfStore(storeId: string | null): StoreScope {
  return storeId ? { storeIds: [storeId], includeUnassigned: false } : { storeIds: [], includeUnassigned: true };
}

/** 対象行の store_id を触ってよいか。UIの出し分けではなくサーバー側の最終防衛に使う（#134） */
export function canAccessStore(actor: InventoryActor, storeId: string | null): boolean {
  const scope = storeScopeOf(actor);
  if (storeId == null) return scope.includeUnassigned;
  if (scope.storeIds == null) return true;
  return scope.storeIds.includes(storeId);
}

/** 店舗の見出し（オーナーは「全店」） */
export function scopeLabel(actor: InventoryActor): string {
  if (actor.isOwner) return "全店";
  if (actor.stores.length === 0) return "店舗未設定";
  return actor.stores.map((s) => s.name).join("・");
}

/** store_id で絞る共通フィルタ。PostgrestFilterBuilder を構造的に受ける（型依存を避ける） */
type StoreFilterable<Q> = {
  in(column: string, values: readonly string[]): Q;
  is(column: string, value: null): Q;
  or(filters: string): Q;
};
/** 何にも一致しない店舗ID（配属ゼロの人に全件を見せないための番人） */
const NO_STORE = "00000000-0000-0000-0000-000000000000";
function withStoreScope<Q extends StoreFilterable<Q>>(q: Q, scope: StoreScope): Q {
  if (scope.storeIds == null) return q; // 全店（オーナー）
  if (scope.storeIds.length === 0)
    return scope.includeUnassigned ? q.is("store_id", null) : q.in("store_id", [NO_STORE]);
  return scope.includeUnassigned
    ? q.or(`store_id.in.(${scope.storeIds.join(",")}),store_id.is.null`)
    : q.in("store_id", scope.storeIds);
}

// ============================================================
// 参照
// ============================================================

/** 理論在庫（inv_stock ビュー）。location でグルーピングしやすい順に返す */
export async function listStock(
  companyId: string,
  opts: { scope?: StoreScope; includeDiscontinued?: boolean } = {}
): Promise<Stock[]> {
  const admin = createAdmin();
  let q = admin.from("inv_stock").select("*").eq("company_id", companyId);
  // 店舗スコープは必ず通す（#134。付け忘れると両店合算になる）
  if (opts.scope) q = withStoreScope(q, opts.scope);
  if (!opts.includeDiscontinued) q = q.eq("status", "active");
  const { data } = await q.order("code");
  return (data ?? []) as Stock[];
}

export async function listSessions(companyId: string, scope: StoreScope, limit = 24): Promise<CountSession[]> {
  const admin = createAdmin();
  let q = admin
    .from("inv_count_sessions")
    .select("id, store_id, counted_on, label, status, closed_at, total_qty, total_value, note")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  q = withStoreScope(q, scope);
  const { data } = await q.order("counted_on", { ascending: false }).limit(limit);
  return (data ?? []) as CountSession[];
}

/** 棚卸1件。scope を渡すと他店舗の棚卸は null になる（URL直打ち対策 #134） */
export async function getSession(companyId: string, id: string, scope?: StoreScope): Promise<CountSession | null> {
  const admin = createAdmin();
  let q = admin
    .from("inv_count_sessions")
    .select("id, store_id, counted_on, label, status, closed_at, total_qty, total_value, note")
    .eq("company_id", companyId)
    .eq("id", id)
    .is("deleted_at", null);
  if (scope) q = withStoreScope(q, scope);
  const { data } = await q.maybeSingle();
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

export type MovementRow = {
  id: string;
  occurred_on: string;
  kind: MovementKind;
  qty: number;
  memo: string | null;
  source_app: string | null;
  store_id: string | null;
  inv_items: { code: string; name: string; unit: string } | null;
};

/** 入出庫の履歴（店舗スコープ必須 #134） */
export async function listMovements(companyId: string, scope: StoreScope, limit = 120): Promise<MovementRow[]> {
  const admin = createAdmin();
  let q = admin
    .from("inv_movements")
    .select("id, occurred_on, kind, qty, memo, source_app, store_id, inv_items(code, name, unit)")
    .eq("company_id", companyId)
    .is("deleted_at", null);
  q = withStoreScope(q, scope);
  const { data } = await q
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as MovementRow[];
}

/** 入出庫1件の取消（論理削除）。自店舗の行しか消せない（#134） */
export async function deleteMovementById(actor: InventoryActor, id: string): Promise<{ error?: string }> {
  const admin = createAdmin();
  const { data } = await admin
    .from("inv_movements")
    .select("id, store_id, kind")
    .eq("id", id)
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .maybeSingle();
  const row = data as { id: string; store_id: string | null; kind: MovementKind } | null;
  if (!row) return { error: "対象の入出庫が見つかりません" };
  if (!canAccessStore(actor, row.store_id)) return { error: "FORBIDDEN: 他店舗の入出庫は取り消せません" };
  if (row.kind === "adjust") return { error: "棚卸調整は取り消せません" };
  const { error } = await admin
    .from("inv_movements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", actor.companyId);
  return error ? { error: error.message } : {};
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
  // 他店舗の棚卸を勝手に立てられないようにする（#134）
  if (!canAccessStore(actor, storeId)) return { error: "FORBIDDEN: この店舗の棚卸は開けません" };

  const admin = createAdmin();
  const on = countedOn ?? jstYmd(); // 「今日」はJSTで解決する（#73）
  const label = `${on.slice(0, 4)}年${Number(on.slice(5, 7))}月 棚卸`;

  // 重複チェックは同じ店舗の中だけで見る（#134。店舗をまたぐと片方の棚卸がもう片方を塞ぐ）
  let existQ = admin
    .from("inv_count_sessions")
    .select("id, status")
    .eq("company_id", actor.companyId)
    .eq("counted_on", on)
    .is("deleted_at", null);
  existQ = withStoreScope(existQ, scopeOfStore(storeId));
  const { data: existing } = await existQ.maybeSingle();
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
  // 確定は在庫が動く操作。他店舗の棚卸を締められないようにサーバー側でも確認する（#134）
  const session = await getSession(actor.companyId, sessionId, storeScopeOf(actor));
  if (!session) return { error: "FORBIDDEN: この棚卸は確定できません" };

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
  // 他店舗の在庫を動かせないようにする（#134）
  if (!canAccessStore(actor, input.storeId)) return { error: "FORBIDDEN: この品番は自店舗のものではありません" };
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
  // 店舗は「指定があればそれ／無ければ自分の主配属」（#134）。
  // 未設定のまま増やすと、あとで店舗を分けられない品番が増え続ける
  const storeId = input.storeId ?? (actor.isOwner ? null : actor.primaryStoreId);
  if (!canAccessStore(actor, storeId)) return { error: "FORBIDDEN: この店舗には登録できません" };

  const admin = createAdmin();
  const { data: code, error: codeErr } = await admin.rpc("inv_next_code", {
    p_company_id: actor.companyId,
    p_category: input.category,
    p_maker: input.maker,
  });
  if (codeErr) return { error: codeErr.message };

  const { error } = await admin.from("inv_items").insert({
    company_id: actor.companyId,
    store_id: storeId,
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
