/**
 * Genesis Context Protocol（Final Architecture §4）
 *
 * Planner と Tool に渡る文脈は常にこの1つの構造。場当たりにデータを集めない。
 * 組み立ては Core API（apps 側）で一度だけ行い、Tool へは ctx.context としてそのまま渡す。
 */
import type { Domain, FactKind, SourceRef } from "./tool.ts";

export type ActorKind = "human" | "ai" | "system";

export type CoreActor = {
  staffId: string | null; // system は null
  name: string;
  kind: ActorKind;
  /** manage_company を持つ人。全店舗横断（#128/#134） */
  isOwner: boolean;
  /** roles.permissions で true のキー一覧（read_only を含む） */
  permissions: string[];
  /** 見てよい店舗。オーナー＝会社の全 active 店舗 */
  storeIds: string[];
  primaryStoreId: string | null;
  /** AI が人の代理で動くとき、その人。Policy は必ずこの人の権限で判定する（AIは人を超えない） */
  onBehalfOf?: CoreActor | null;
};

export type Surface = "web" | "mobile" | "ipad" | "line" | "voice" | "mcp" | "api" | "cron";

export type Focus = { stores?: string[]; domains?: Domain[]; projectId?: string } | null;

export type ContextFact = { label: string; value: string | number; source: SourceRef; kind: FactKind };

export type GenesisContext = {
  actor: CoreActor;
  company: { id: string; name: string; kind: "operating" | "tenant" | "demo" };
  store: { id: string; name: string } | null;
  focus: Focus;
  entity: { kind: string; id: string; label: string } | null;
  project: { id: string; name: string } | null;
  recentEvents: Array<{ type: string; version: number; entity: string | null; occurredAt: string; summary: string }>;
  memory: Array<{ scope: string; key: string; value: string; confidence: number }>;
  time: { nowIso: string; jstDate: string; jstHour: number; weekday: number };
  surface: Surface;
  conversation: Array<{ role: "user" | "assistant"; text: string; at?: string }>;
  facts: ContextFact[];
};

/** JST の「今」（jst-date-rule: サーバーで UTC の today を使わない） */
export function jstTime(now: Date = new Date()): GenesisContext["time"] {
  const jst = new Date(now.getTime() + 9 * 3600_000);
  return {
    nowIso: now.toISOString(),
    jstDate: jst.toISOString().slice(0, 10),
    jstHour: jst.getUTCHours(),
    weekday: jst.getUTCDay(),
  };
}

/** 最小の Context（cron・テスト・MCP 代理実行の土台）。必要な項目だけ上書きして使う */
export function baseContext(input: {
  actor: CoreActor;
  company: GenesisContext["company"];
  surface: Surface;
  store?: GenesisContext["store"];
  focus?: Focus;
  now?: Date;
}): GenesisContext {
  return {
    actor: input.actor,
    company: input.company,
    store: input.store ?? null,
    focus: input.focus ?? null,
    entity: null,
    project: null,
    recentEvents: [],
    memory: [],
    time: jstTime(input.now),
    surface: input.surface,
    conversation: [],
    facts: [],
  };
}

/** Policy が見る「実効 Actor」。AI は代理元の人の権限で判定される */
export function effectiveActor(actor: CoreActor): CoreActor {
  return actor.kind === "ai" && actor.onBehalfOf ? actor.onBehalfOf : actor;
}

/** Focus Mode で絞った店舗。未指定なら Actor の見える店舗 */
export function visibleStoreIds(ctx: GenesisContext): string[] {
  const base = effectiveActor(ctx.actor).storeIds;
  const focus = ctx.focus?.stores;
  return focus && focus.length ? base.filter((s) => focus.includes(s)) : base;
}

/** 直近イベントと Memory を DB から足す（apps 側の Core API が呼ぶ）。失敗しても Context は返す */
export async function enrichContext(admin: import("./tool.ts").AdminLike, ctx: GenesisContext, opts: { events?: number } = {}): Promise<GenesisContext> {
  const out: GenesisContext = { ...ctx };
  try {
    const { data } = await admin
      .from("gn_events")
      .select("type, schema_version, entity_kind, entity_id, occurred_at, payload")
      .eq("company_id", ctx.company.id)
      .order("occurred_at", { ascending: false })
      .limit(opts.events ?? 10);
    out.recentEvents = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      type: String(r.type),
      version: Number(r.schema_version ?? 1),
      entity: r.entity_kind ? `${String(r.entity_kind)}:${String(r.entity_id ?? "")}` : null,
      occurredAt: String(r.occurred_at),
      summary: String((r.payload as Record<string, unknown> | null)?.summary ?? r.type),
    }));
  } catch {
    /* gn_events 未適用でも動く */
  }
  // Memory（#299）: company ＋ 見える店舗 ＋ 本人 ＋（あれば）今の customer / project
  try {
    const { loadMemory, toContextMemory } = await import("./memory.ts");
    out.memory = toContextMemory(await loadMemory(admin, out));
  } catch {
    /* gn_memories 未適用でも動く */
  }
  return out;
}
