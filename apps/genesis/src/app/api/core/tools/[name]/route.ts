import { NextResponse } from "next/server";
import { coreApiActor } from "@/core/api-auth";
import { runTool } from "@/core/run";
import { getCore } from "@/core/registry";

export const dynamic = "force-dynamic";

/** Tool 実行（Genesis Core API）。承認が要るものはここでは実行せず ai_action_queue へ積んで queued を返す */
export async function POST(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const a = await coreApiActor(req);
  if (a instanceof NextResponse) return a;
  const { name } = await ctx.params;
  const ref = decodeURIComponent(name);
  if (!getCore().registry.has(ref)) return NextResponse.json({ error: `unknown tool: ${ref}` }, { status: 404 });
  let body: { input?: Record<string, unknown>; store_id?: string | null; title?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* 空ボディ */
  }
  const r = await runTool({ actor: a.actor, ref, input: body.input ?? {}, surface: a.surface, storeId: body.store_id ?? null, origin: a.surface === "web" ? "api" : a.surface, title: body.title });
  const status = r.status === "denied" ? 403 : r.status === "unknown_tool" ? 404 : r.status === "invalid_input" ? 400 : 200;
  return NextResponse.json(r, { status });
}
