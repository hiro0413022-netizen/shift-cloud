/**
 * P0 の Tool 一式（22本）＋ Waiting ＋ Skill（#294）と、Core をまとめて組み立てる createGenesisCore()。
 * apps 側はこれに自アプリ固有の Tool（message.send 等）を足して使う。
 */
import type { ToolContract } from "../tool.ts";
import { ToolRegistry } from "../registry.ts";
import { createBlockRegistry, type BlockContract } from "../blocks.ts";
import { createEventCatalog, type EventContract } from "../events.ts";
import { OPS_TOOLS } from "./ops.ts";
import { CUSTOMER_TOOLS } from "./customer.ts";
import { FINANCE_TOOLS } from "./finance.ts";
import { GROWTH_TOOLS } from "./growth.ts";
import { DEV_TOOLS } from "./dev.ts";
import { WAITING_TOOLS } from "./waiting.ts";
import { SKILL_TOOLS } from "../skills/index.ts";
import { MEMORY_TOOLS } from "./memory.ts";
import { SEARCH_TOOLS } from "./search.ts";

export const CORE_TOOLS: ToolContract[] = [...OPS_TOOLS, ...CUSTOMER_TOOLS, ...FINANCE_TOOLS, ...GROWTH_TOOLS, ...DEV_TOOLS, ...WAITING_TOOLS, ...MEMORY_TOOLS, ...SEARCH_TOOLS, ...SKILL_TOOLS];

export function createGenesisCore(opts: { tools?: ToolContract[]; blocks?: BlockContract[]; events?: EventContract[] } = {}) {
  const blocks = createBlockRegistry(opts.blocks ?? []);
  const catalog = createEventCatalog(opts.events ?? []);
  const registry = new ToolRegistry({ blocks }).registerAll(CORE_TOOLS).registerAll(opts.tools ?? []);
  return { registry, blocks, catalog };
}
