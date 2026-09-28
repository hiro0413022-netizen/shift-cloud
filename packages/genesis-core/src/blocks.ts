/**
 * Block Registry（Final Architecture §8）
 *
 * AI は HTML / React を返さない。返すのは { block, version, data, meta }。
 * Renderer（Web は React、LINE はテキスト化）が Registry を引いて描く。
 * Block は後から register() で足せる（プラグイン式）。「12種固定」にはしない。
 */
import { validate, type JsonSchema } from "./schema.ts";
import type { FactKind, SourceRef } from "./tool.ts";

export type BlockContract = {
  name: string;
  version: number;
  description: string;
  /** data の形 */
  schema: JsonSchema;
  /** この Block が持てる操作（Renderer がボタンにする）。Tool 参照 'booking.cancel@1' か画面内操作 'drill' */
  actions?: string[];
};

export type BlockMeta = {
  kind: FactKind;
  sources?: SourceRef[];
  /** 表示用の一言（例:「9/27 10:32 時点」） */
  asOf?: string | null;
  /** 読み Tool の行数（0件の根拠表示） */
  rowCount?: number | null;
};

export type BlockInstance<T = Record<string, unknown>> = {
  block: string;
  version: number;
  data: T;
  meta: BlockMeta;
};

export class BlockRegistry {
  private blocks = new Map<string, BlockContract>();

  register(b: BlockContract): this {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(b.name)) throw new Error(`Block 名は PascalCase: ${b.name}`);
    if (b.schema.type !== "object") throw new Error(`${b.name}: schema は object`);
    this.blocks.set(b.name, b);
    return this;
  }

  has(name: string): boolean {
    return this.blocks.has(name);
  }

  get(name: string): BlockContract | null {
    return this.blocks.get(name) ?? null;
  }

  list(): BlockContract[] {
    return [...this.blocks.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Tool の出力を Block インスタンスにする。data が schema に合わなければ SourceNote に落として壊さない */
  make(name: string, data: Record<string, unknown>, meta: BlockMeta): BlockInstance {
    const b = this.blocks.get(name);
    if (!b) return { block: "SourceNote", version: 1, data: { title: `未登録Block: ${name}`, body: JSON.stringify(data).slice(0, 2000) }, meta };
    const v = validate(b.schema, data);
    if (!v.ok) {
      return {
        block: "SourceNote",
        version: 1,
        data: { title: `${name} の data が形に合いません`, body: v.errors.join("\n") },
        meta: { ...meta, kind: "fact" },
      };
    }
    return { block: b.name, version: b.version, data: v.value as Record<string, unknown>, meta };
  }
}

const obj = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({ type: "object", properties, required });
const str: JsonSchema = { type: "string" };
const num: JsonSchema = { type: "number" };
const anyArr: JsonSchema = { type: "array", items: { type: "object" } };

/** 初期 Block（Transformation Proposal のブロック目録）。追加は register() で */
export const BASE_BLOCKS: BlockContract[] = [
  { name: "KPI", version: 1, description: "数字1つ（目標・前期比つき）", schema: obj({ label: str, value: num, unit: str, target: { type: "number", nullable: true }, delta: { type: "number", nullable: true }, drill: { type: "string", nullable: true } }, ["label", "value"]), actions: ["drill"] },
  { name: "Table", version: 1, description: "行と列", schema: obj({ columns: { type: "array", items: str }, rows: anyArr, title: str }, ["columns", "rows"]), actions: ["csv"] },
  { name: "Chart", version: 1, description: "系列データ（line/bar）", schema: obj({ kind: { type: "string", enum: ["line", "bar"] }, series: anyArr, title: str }, ["kind", "series"]) },
  { name: "EntityCard", version: 1, description: "Person / Store / Product の1枚", schema: obj({ kind: str, id: str, title: str, subtitle: str, fields: anyArr, href: str }, ["kind", "id", "title"]), actions: ["open", "timeline"] },
  { name: "Timeline", version: 1, description: "Entity の履歴", schema: obj({ entity: str, items: anyArr }, ["items"]) },
  { name: "BookingCard", version: 1, description: "予約1件", schema: obj({ booking_id: { type: "string", nullable: true }, date: str, start: str, end: str, bay: str, who: str, status: str }, ["date", "start"]), actions: ["booking.cancel@1"] },
  { name: "BookingList", version: 1, description: "予約の一覧（日別）", schema: obj({ date: str, items: anyArr }, ["items"]) },
  { name: "ShiftGrid", version: 1, description: "シフト表", schema: obj({ from: str, to: str, rows: anyArr }, ["rows"]) },
  { name: "ApprovalCard", version: 1, description: "承認1件（判断フィードと同型）", schema: obj({ action_id: str, title: str, detail: str, risk: num, mode: str }, ["action_id", "title"]), actions: ["approve", "reject", "revise"] },
  { name: "PlanCard", version: 1, description: "実行計画（DAG）の進捗。Skill の結果はこれ＋各 Step の Block", schema: obj({ plan_id: str, goal: str, steps: anyArr, status: str, summary: str }, ["plan_id", "goal", "steps"]), actions: ["cancel"] },
  { name: "MessageDraft", version: 1, description: "送信前の文面", schema: obj({ to: str, channel: str, body: str, audience: str }, ["body"]), actions: ["message.send@1"] },
  { name: "SourceNote", version: 1, description: "出典・生成SQL・件数・エラー", schema: obj({ title: str, body: str, sql: { type: "string", nullable: true }, rowCount: { type: "number", nullable: true } }, ["title"]) },
  { name: "AppPanel", version: 1, description: "既存アプリの画面を右パネルで開く", schema: obj({ app: str, path: str, title: str }, ["app", "path"]), actions: ["open"] },
  { name: "Summary", version: 1, description: "件数・合計など数値のまとめ", schema: obj({ title: str, items: anyArr }, ["items"]) },
  { name: "Health", version: 1, description: "システム死活", schema: obj({ items: anyArr, ok: { type: "boolean" } }, ["items"]) },
];

export function createBlockRegistry(extra: BlockContract[] = []): BlockRegistry {
  const r = new BlockRegistry();
  for (const b of BASE_BLOCKS) r.register(b);
  for (const b of extra) r.register(b);
  return r;
}
