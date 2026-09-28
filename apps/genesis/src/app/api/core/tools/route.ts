import { NextResponse } from "next/server";
import { coreApiActor } from "@/core/api-auth";
import { getCore } from "@/core/registry";

export const dynamic = "force-dynamic";

/** Tool 一覧（Genesis Core API・Final Architecture §9）。MCP manifest と同じ Registry から出す */
export async function GET(req: Request) {
  const a = await coreApiActor(req);
  if (a instanceof NextResponse) return a;
  const { registry, blocks, catalog } = getCore();
  const url = new URL(req.url);
  const domain = url.searchParams.get("domain") as "ops" | "customer" | "finance" | "growth" | "dev" | null;
  return NextResponse.json({
    tools: registry.list({ domain: domain ?? undefined, latestOnly: url.searchParams.get("all") !== "1" }),
    blocks: blocks.list().map((b) => ({ name: b.name, version: b.version, description: b.description, actions: b.actions ?? [] })),
    events: catalog.list().map((e) => ({ type: e.type, version: e.version, entity: e.entity, description: e.description })),
    count: registry.size(),
  });
}
