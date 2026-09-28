/**
 * Event Contract（Final Architecture §6）
 *
 * gn_events は「機械が読む outbox」。company_events（人が読むタイムライン）はそのまま残す。
 * type@schema_version で宣言し、同じ type の新スキーマは version を上げて並存させる。
 * カタログに無いイベントは存在しない（Ask Data と同じ思想）。
 */
import { validate, type JsonSchema } from "./schema.ts";
import type { AdminLike } from "./tool.ts";
import type { ActorKind } from "./context.ts";

export type EventContract = {
  type: string; // 'reservation.created'
  version: number;
  entity: string; // 'reservation' | 'person' | 'shift' | ...
  description: string;
  payload: JsonSchema;
};

export type EventInput = {
  type: string;
  version: number;
  companyId: string;
  storeId?: string | null;
  entity?: { kind: string; id: string } | null;
  payload: Record<string, unknown>;
  actor?: { kind: ActorKind; staffId?: string | null };
  /** 発行元 'booking.create@1' / 'trigger:frunk_bookings' */
  source: string;
  occurredAt?: string;
};

export class EventCatalog {
  private events = new Map<string, EventContract>();

  register(e: EventContract): this {
    if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(e.type)) throw new Error(`Event type は entity.verb: ${e.type}`);
    this.events.set(`${e.type}@${e.version}`, e);
    return this;
  }

  get(type: string, version: number): EventContract | null {
    return this.events.get(`${type}@${version}`) ?? null;
  }

  list(): EventContract[] {
    return [...this.events.values()].sort((a, b) => `${a.type}@${a.version}`.localeCompare(`${b.type}@${b.version}`));
  }

  /** 宣言に対して payload を検証。未登録は「存在しない」＝エラー */
  check(type: string, version: number, payload: Record<string, unknown>): string[] {
    const e = this.get(type, version);
    if (!e) return [`未登録イベント: ${type}@${version}`];
    const v = validate(e.payload, payload);
    return v.ok ? [] : v.errors;
  }
}

const obj = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: "object", properties, required });
const str: JsonSchema = { type: "string" };

/** P0 のイベントカタログ（Tool の emits と対応）。増やしたら docs/genesis/EVENTS.md にも書く */
export const BASE_EVENTS: EventContract[] = [
  { type: "reservation.created", version: 1, entity: "reservation", description: "打席予約が入った", payload: obj({ booking_id: str, date: str, start: str, bay: str, who: str, summary: str }, ["booking_id", "date"]) },
  { type: "reservation.cancelled", version: 1, entity: "reservation", description: "打席予約が取り消された", payload: obj({ booking_id: str, summary: str }, ["booking_id"]) },
  { type: "visit.recorded", version: 1, entity: "person", description: "受付台帳に来店・体験が載った", payload: obj({ walkin_id: str, visited_on: str, visit_type: str, guest: str, summary: str }, ["walkin_id", "visited_on"]) },
  { type: "message.sent", version: 1, entity: "message", description: "LINE を送った", payload: obj({ audience: str, target: str, chars: { type: "integer" }, summary: str }, ["audience"]) },
  { type: "payment.completed", version: 1, entity: "reservation", description: "予約の入金が付いた（トリガー）", payload: obj({ booking_id: str, amount: { type: "number" }, summary: str }, ["booking_id"]) },
  { type: "trial.converted", version: 1, entity: "person", description: "体験から入会した（トリガー）", payload: obj({ walkin_id: str, guest: str, summary: str }, ["walkin_id"]) },
  { type: "membership.started", version: 1, entity: "person", description: "FRANK 会員が在籍になった（トリガー）", payload: obj({ member_no: str, name: str, summary: str }, []) },
  { type: "membership.resumed", version: 1, entity: "person", description: "休会から復帰（トリガー）", payload: obj({ member_no: str, name: str, summary: str }, []) },
  { type: "membership.suspended", version: 1, entity: "person", description: "休会（トリガー）", payload: obj({ member_no: str, name: str, summary: str }, []) },
  { type: "membership.left", version: 1, entity: "person", description: "退会（トリガー）", payload: obj({ member_no: str, name: str, summary: str }, []) },
  { type: "inquiry.received", version: 1, entity: "inquiry", description: "問い合わせ受信（トリガー）", payload: obj({ source: str, from: str, summary: str }, []) },
  { type: "inquiry.replied", version: 1, entity: "inquiry", description: "問い合わせに返信した（トリガー）→ 返事待ちを立てる", payload: obj({ from: str, summary: str }, []) },
  { type: "shift.published", version: 1, entity: "shift_day", description: "シフト確定（店舗×日・トリガー）", payload: obj({ date: str, summary: str }, ["date"]) },
  { type: "incident.reported", version: 1, entity: "incident", description: "イレギュラー報告（トリガー）", payload: obj({ category: str, severity: str, summary: str }, []) },
  { type: "order.placed", version: 1, entity: "order", description: "モバイルオーダー（トリガー）", payload: obj({ order_no: str, amount: { type: "number" }, summary: str }, []) },
  { type: "rule.fired", version: 1, entity: "rule", description: "Proactive ルールが発火した", payload: obj({ code: str, count: { type: "integer" }, title: str, summary: str }, ["code"]) },
  { type: "devreq.created", version: 1, entity: "devreq", description: "開発依頼が積まれた", payload: obj({ request_id: str, title: str, summary: str }, ["request_id"]) },
  { type: "tool.failed", version: 1, entity: "tool", description: "Tool 実行が失敗した（Self Healing の入口）", payload: obj({ tool: str, error: str, execution_id: str, summary: str }, ["tool", "error"]) },
  { type: "tool.silent_zero", version: 1, entity: "tool", description: "読み Tool が期待下限を下回った（黙って0件の検知）", payload: obj({ tool: str, rows: { type: "integer" }, min_rows: { type: "integer" }, summary: str }, ["tool"]) },
];

export function createEventCatalog(extra: EventContract[] = []): EventCatalog {
  const c = new EventCatalog();
  for (const e of BASE_EVENTS) c.register(e);
  for (const e of extra) c.register(e);
  return c;
}

/** gn_events へ1件書く。catalog を渡した場合は検証してから書く（検証エラーは例外） */
export async function emitEvent(admin: AdminLike, e: EventInput, catalog?: EventCatalog): Promise<string | null> {
  if (catalog) {
    const errs = catalog.check(e.type, e.version, e.payload);
    if (errs.length) throw new Error(`イベント検証エラー ${e.type}@${e.version}: ${errs.join(" / ")}`);
  }
  const { data, error } = await admin
    .from("gn_events")
    .insert({
      company_id: e.companyId,
      store_id: e.storeId ?? null,
      type: e.type,
      schema_version: e.version,
      entity_kind: e.entity?.kind ?? null,
      entity_id: e.entity?.id ?? null,
      payload: e.payload,
      actor_kind: e.actor?.kind ?? "system",
      actor_staff_id: e.actor?.staffId ?? null,
      source: e.source,
      occurred_at: e.occurredAt ?? new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(`gn_events insert 失敗: ${error.message}`);
  return data?.id ? String(data.id) : null;
}
