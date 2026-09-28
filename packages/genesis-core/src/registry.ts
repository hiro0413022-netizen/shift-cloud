/**
 * Tool Registry（Final Architecture §2/§3）
 *
 * - 登録時に Contract を静的検証する（壊れた Tool は登録できない）
 * - name@version で並存。resolve('booking.create') は最新版
 * - MCP の tools/list 形式をそのまま出せる（P0 は公開しない・形だけ）
 * - Block Registry を渡すと renders の存在も検証する
 */
import { parseToolRef, toolKey, validateContract, type ToolContract, type Domain } from "./tool.ts";
import { toMcpSchema } from "./schema.ts";
import type { BlockRegistry } from "./blocks.ts";

export type ToolSummary = {
  ref: string;
  name: string;
  version: number;
  latest: boolean;
  domain: Domain;
  description: string;
  permission: string[];
  scope: string;
  risk: number;
  emits: string[];
  renders: string;
  rateLimit: number;
};

export class ToolRegistry {
  private tools = new Map<string, ToolContract>();
  private latest = new Map<string, number>();
  private blocks: BlockRegistry | null;

  constructor(opts: { blocks?: BlockRegistry } = {}) {
    this.blocks = opts.blocks ?? null;
  }

  register(tool: ToolContract): this {
    const errors = validateContract(tool);
    if (this.blocks && !this.blocks.has(tool.renders)) errors.push(`${tool.name}: renders='${tool.renders}' は Block Registry に無い`);
    if (errors.length) throw new Error(`Tool 登録エラー:\n- ${errors.join("\n- ")}`);
    const key = toolKey(tool.name, tool.version);
    if (this.tools.has(key)) throw new Error(`Tool 重複登録: ${key}`);
    this.tools.set(key, tool);
    const cur = this.latest.get(tool.name) ?? 0;
    if (tool.version > cur) this.latest.set(tool.name, tool.version);
    return this;
  }

  registerAll(tools: ToolContract[]): this {
    for (const t of tools) this.register(t);
    return this;
  }

  /** 'name' or 'name@N'。無ければ null（呼び出し側が「存在しない操作」を提案しないための線） */
  resolve(ref: string): ToolContract | null {
    const { name, version } = parseToolRef(ref);
    const v = version ?? this.latest.get(name);
    if (!v) return null;
    return this.tools.get(toolKey(name, v)) ?? null;
  }

  has(ref: string): boolean {
    try {
      return this.resolve(ref) !== null;
    } catch {
      return false;
    }
  }

  list(filter: { domain?: Domain; maxRisk?: number; latestOnly?: boolean } = {}): ToolSummary[] {
    const out: ToolSummary[] = [];
    for (const t of this.tools.values()) {
      if (filter.domain && t.domain !== filter.domain) continue;
      if (filter.maxRisk !== undefined && t.risk > filter.maxRisk) continue;
      const latest = this.latest.get(t.name) === t.version;
      if (filter.latestOnly && !latest) continue;
      out.push({
        ref: toolKey(t.name, t.version),
        name: t.name,
        version: t.version,
        latest,
        domain: t.domain,
        description: t.description,
        permission: t.permission,
        scope: t.scope,
        risk: t.risk,
        emits: t.emits,
        renders: t.renders,
        rateLimit: t.rateLimit.perMinute,
      });
    }
    return out.sort((a, b) => a.ref.localeCompare(b.ref));
  }

  size(): number {
    return this.tools.size;
  }

  /** LLM に見せる短い一覧（Planner のプロンプト用）。risk と引数の形だけ */
  catalogText(filter: { domain?: Domain; maxRisk?: number } = {}): string {
    return this.list({ ...filter, latestOnly: true })
      .map((t) => {
        const tool = this.resolve(t.ref)!;
        const props = Object.entries(tool.input.properties ?? {})
          .map(([k, s]) => `${k}${(tool.input.required ?? []).includes(k) ? "" : "?"}:${s.type ?? "any"}`)
          .join(", ");
        return `${t.ref} [risk ${t.risk}] ${t.description} — args {${props}}`;
      })
      .join("\n");
  }

  /** MCP tools/list（Model Context Protocol）。Tool 名は '@' が使えないため 'booking.create__v1' にする */
  mcpManifest(filter: { maxRisk?: number } = {}) {
    return {
      tools: this.list({ ...filter, latestOnly: false }).map((t) => {
        const tool = this.resolve(t.ref)!;
        return {
          name: `${t.name}__v${t.version}`,
          description: `${t.description}（domain=${t.domain} risk=${t.risk} scope=${t.scope}${t.latest ? "" : " / 旧版"}）`,
          inputSchema: toMcpSchema(tool.input),
          annotations: { readOnlyHint: t.risk === 0, destructiveHint: t.risk >= 4, idempotentHint: true },
        };
      }),
    };
  }

  /** MCP 名 'booking.create__v1' → 'booking.create@1' */
  static fromMcpName(name: string): string {
    return name.replace(/__v(\d+)$/, "@$1");
  }
}
