import { NextResponse } from "next/server";
import { getGenesisActor } from "@/lib/auth";
import { HEALTH_TARGETS } from "@/app/(main)/network/topology";

export const dynamic = "force-dynamic";

type HealthResult = { id: string; ok: boolean; status: number; ms: number };

async function check(id: string, url: string): Promise<HealthResult> {
  const started = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: ctrl.signal,
      headers: { "user-agent": "genesis-network-monitor" },
    });
    clearTimeout(timer);
    // ログイン画面へのリダイレクトや401でも「生きている」と判定。5xxのみ異常。
    return { id, ok: res.status < 500, status: res.status, ms: Date.now() - started };
  } catch {
    return { id, ok: false, status: 0, ms: Date.now() - started };
  }
}

export async function GET() {
  const actor = await getGenesisActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const targets: { id: string; url: string }[] = [...HEALTH_TARGETS];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) targets.push({ id: "supabase", url: `${supabaseUrl}/auth/v1/health` });
  // kernelはDBと同体なのでsupabaseの結果を流用する
  const results = await Promise.all(targets.map((t) => check(t.id, t.url)));
  const supa = results.find((r) => r.id === "supabase");
  if (supa) results.push({ ...supa, id: "kernel" });

  return NextResponse.json({ checkedAt: new Date().toISOString(), results });
}
// EOF-network-health
