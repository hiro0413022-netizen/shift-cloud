/**
 * Tool 実装の共通部品。
 * 読み Tool は原則 Ask Data と同じ gnv_* ビュー（gn_chat_query）を通す＝
 * 実体テーブルに触れない・店舗スコープはDBが強制する（0053 の4層防御をそのまま使う）。
 */
import type { AdminLike, SourceRef, ToolOutput } from "../tool.ts";
import type { GenesisContext } from "../context.ts";
import { effectiveActor } from "../context.ts";

export const FRANK_STORE_ID = "b54afb9f-22aa-4f4e-b758-bc2157acfdd5";

export type Row = Record<string, unknown>;

/** Ask Data のスコープ（hq = 全店・給与経理も / store = 自店舗のみ） */
export function askScope(ctx: GenesisContext): { scope: "hq" | "store"; storeId: string | null } {
  const a = effectiveActor(ctx.actor);
  const hq = a.isOwner || a.permissions.includes("view_hq");
  const storeId = ctx.store?.id ?? a.primaryStoreId;
  return { scope: hq ? "hq" : "store", storeId };
}

/** gnv_* ビューに SELECT 1本（DB 側で company/store を強制・LIMIT 強制） */
export async function viewQuery(admin: AdminLike, ctx: GenesisContext, sql: string, limit = 200): Promise<Row[]> {
  const { scope, storeId } = askScope(ctx);
  const { data, error } = await admin.rpc("gn_chat_query", {
    p_sql: sql,
    p_company_id: ctx.company.id,
    p_scope: scope,
    p_store_id: storeId,
    p_limit: limit,
  });
  if (error) throw new Error(`gnv query 失敗: ${error.message}`);
  return (data ?? []) as Row[];
}

/** SQL リテラル用の最小エスケープ（日付・名前を埋めるとき）。識別子には使わない */
export function lit(v: string): string {
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function isYmd(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function src(table: string, note?: string, verified = true): SourceRef {
  return { table, updatedAt: new Date().toISOString(), verified, note };
}

export function rows(data: Row[], table: string, extra: Partial<ToolOutput> = {}): ToolOutput {
  const { data: ex, ...rest } = extra;
  return { data: { rows: data, count: data.length, ...(ex ?? {}) }, sources: [src(table)], kind: "fact", rowCount: data.length, ...rest };
}

/** 月初〜今日 / 先月 などの日付 */
export function monthRange(jstDate: string, offsetMonths = 0): { from: string; to: string } {
  const [y, m] = jstDate.split("-").map(Number);
  const d0 = new Date(Date.UTC(y, m - 1 + offsetMonths, 1));
  const d1 = new Date(Date.UTC(y, m + offsetMonths, 1));
  return { from: d0.toISOString().slice(0, 10), to: d1.toISOString().slice(0, 10) };
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** from〜to の期間を「to を含む」形に正規化。LLM は「明後日」を from=to=同じ日 で渡してくるので、
 *  排他境界のまま使うと 0 件になる（2026-09-28 実機で発見）。to が無ければ from + days */
export function inclusiveRange(from: unknown, to: unknown, fallbackDays: number, today: string): { from: string; to: string } {
  const f = isYmd(from) ? from : today;
  const t = isYmd(to) && to >= f ? addDays(to, 1) : addDays(f, fallbackDays);
  return { from: f, to: t };
}

export const STORE_IN = { type: "string", format: "uuid", description: "店舗ID（省略時は主所属）" } as const;
