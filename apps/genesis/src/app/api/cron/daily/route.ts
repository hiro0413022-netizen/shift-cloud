import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { runDailyCeoReport } from "@/lib/ceo-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 毎朝のCEO AI自動報告（VISION §1「朝、Cockpitを開くとCEO AIが報告する」）
 * Vercel Cron（vercel.json）から呼ばれる。認証: Authorization: Bearer ${CRON_SECRET}
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdmin();
  const { data: companies } = await admin.from("companies").select("id").is("deleted_at", null);
  const results = [];
  for (const c of companies ?? []) {
    try {
      const r = await runDailyCeoReport(String(c.id), "cron");
      results.push({ company: c.id, ...r });
    } catch (e) {
      results.push({ company: c.id, error: String(e) });
    }
  }
  return NextResponse.json({ ok: true, results });
}
