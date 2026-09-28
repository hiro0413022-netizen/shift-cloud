import { NextResponse } from "next/server";
import { coreApiActor } from "@/core/api-auth";
import { runTool } from "@/core/run";
import { getCore } from "@/core/registry";
import { ToolRegistry } from "@yozan/genesis-core/registry";

export const dynamic = "force-dynamic";

/**
 * MCP 互換の入口（P0 は形だけ・GO条件 9）。
 *   GET  → tools/list（manifest）
 *   POST → JSON-RPC {"method":"tools/list"} / {"method":"tools/call","params":{"name":"booking.list__v1","arguments":{}}}
 * 認証は Bearer GENESIS_CORE_SECRET ＋ x-genesis-staff-id（代理元の人）。
 * Claude Code / Cowork からは DB を直接叩かず、この口を通す＝ Permission / Audit / Risk / Verification が共通になる。
 */
export async function GET(req: Request) {
  const a = await coreApiActor(req);
  if (a instanceof NextResponse) return a;
  return NextResponse.json({ protocolVersion: "2025-06-18", serverInfo: { name: "genesis-core", version: "0.1.0" }, ...getCore().registry.mcpManifest() });
}

export async function POST(req: Request) {
  const a = await coreApiActor(req);
  if (a instanceof NextResponse) return a;
  let rpc: { id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } } = {};
  try {
    rpc = (await req.json()) as typeof rpc;
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", error: { code: -32700, message: "parse error" } }, { status: 400 });
  }
  const id = rpc.id ?? null;
  if (rpc.method === "tools/list") return NextResponse.json({ jsonrpc: "2.0", id, result: getCore().registry.mcpManifest() });
  if (rpc.method === "tools/call") {
    const name = String(rpc.params?.name ?? "");
    const ref = ToolRegistry.fromMcpName(name);
    if (!getCore().registry.has(ref)) return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32602, message: `unknown tool: ${name}` } });
    const r = await runTool({ actor: a.actor, ref, input: rpc.params?.arguments ?? {}, surface: "mcp", origin: "mcp" });
    const text = JSON.stringify({ status: r.status, output: r.output, sources: r.sources, kind: r.kind, policy: r.policy, queued: r.queued ?? null, error: r.error });
    return NextResponse.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: r.status === "failed" || r.status === "denied" || r.status === "verify_failed" } });
  }
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "method not found" } });
}
