import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * Webhook受信基盤（Integration Mesh, Phase 4）
 * POST /api/webhooks/{connector}?token=xxx
 * 1. connectorコード＋トークン（sha256照合, DECISIONS #18）で認証
 * 2. webhook_logs に生ログ保存
 * 3. external_events に変換保存
 * 4. company_events に昇格（AIが後で解釈できる形）
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ connector: string }> }
) {
  const { connector: connectorCode } = await params;
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? request.headers.get("x-genesis-token") ?? "";

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: connector } = await admin
    .from("connectors")
    .select("*")
    .eq("code", connectorCode)
    .is("deleted_at", null)
    .limit(1)
    .single();

  if (!connector || !connector.webhook_token_hash) {
    return NextResponse.json({ error: "unknown connector" }, { status: 404 });
  }

  const hash = createHash("sha256").update(token).digest("hex");
  const expected = Buffer.from(String(connector.webhook_token_hash));
  const actual = Buffer.from(hash);
  if (!token || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    payload = { raw: await request.text().catch(() => "") };
  }

  const headers: Record<string, string> = {};
  for (const key of ["x-github-event", "x-vercel-deployment-url", "content-type", "user-agent"]) {
    const v = request.headers.get(key);
    if (v) headers[key] = v;
  }

  // 1. 生ログ
  const { data: log } = await admin
    .from("webhook_logs")
    .insert({
      company_id: connector.company_id,
      connector_id: connector.id,
      headers,
      payload,
      status: "received",
    })
    .select("id")
    .single();

  try {
    // 2. External Event化
    const p = (payload ?? {}) as Record<string, unknown>;
    const externalType =
      headers["x-github-event"] ??
      (typeof p.type === "string" ? p.type : null) ??
      (typeof p.event === "string" ? p.event : null) ??
      "unknown";
    const title = summarize(connectorCode, externalType, p);

    const { data: ext } = await admin
      .from("external_events")
      .insert({
        company_id: connector.company_id,
        connector_id: connector.id,
        external_type: externalType,
        external_id: typeof p.id === "string" || typeof p.id === "number" ? String(p.id) : null,
        payload: p,
      })
      .select("id")
      .single();

    // 3. Company Eventへ昇格
    const { data: ev } = await admin
      .from("company_events")
      .insert({
        company_id: connector.company_id,
        event_type: `${connectorCode}.${externalType}`,
        title,
        source: `webhook:${connectorCode}`,
        source_type: "external",
        severity: "info",
        raw_payload: p,
      })
      .select("id")
      .single();

    await Promise.all([
      ext?.id
        ? admin.from("external_events").update({ processed: true, company_event_id: ev?.id ?? null }).eq("id", ext.id)
        : Promise.resolve(),
      log?.id ? admin.from("webhook_logs").update({ status: "processed" }).eq("id", log.id) : Promise.resolve(),
      admin.from("connectors").update({ last_event_at: new Date().toISOString(), status: "active" }).eq("id", connector.id),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (log?.id) {
      await admin.from("webhook_logs").update({ status: "error", error: String(e) }).eq("id", log.id);
    }
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}

function summarize(connector: string, type: string, p: Record<string, unknown>): string {
  if (connector === "github") {
    if (type === "push") {
      const commits = Array.isArray(p.commits) ? p.commits.length : 0;
      return `GitHub push: ${commits} commit(s) → ${String((p.repository as Record<string, unknown> | undefined)?.name ?? "")}`;
    }
    return `GitHub ${type}`;
  }
  if (connector === "vercel") {
    return `Vercel ${type}`;
  }
  if (connector === "sentry") {
    return `Sentryエラー: ${String((p as { message?: string }).message ?? type)}`;
  }
  return `${connector}: ${type}`;
}
