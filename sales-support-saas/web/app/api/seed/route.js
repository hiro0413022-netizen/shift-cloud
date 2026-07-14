import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORDER = [
  "tenants", "app_users", "projects", "pipeline_stages", "channels",
  "companies", "contacts", "customers", "leads", "monitors",
  "events", "event_participants", "campaigns", "campaign_targets", "memberships",
];

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export async function GET(req) {
  const token = new URL(req.url).searchParams.get("token");
  if (!process.env.SEED_TOKEN || token !== process.env.SEED_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const file = path.join(process.cwd(), "seed", "data.json");
  const data = JSON.parse(await readFile(file, "utf8"));
  const supa = db();
  const result = {};

  for (const table of ORDER) {
    const rows = data[table] || [];
    if (rows.length === 0) { result[table] = 0; continue; }
    const conflict = table === "memberships" ? "tenant_id,user_id" : "id";
    let ok = 0;
    for (const part of chunk(rows, 400)) {
      const { error } = await supa.from(table).upsert(part, { onConflict: conflict });
      if (error) return NextResponse.json({ table, error: error.message, done: result }, { status: 500 });
      ok += part.length;
    }
    result[table] = ok;
  }

  return NextResponse.json({ ok: true, inserted: result });
}
