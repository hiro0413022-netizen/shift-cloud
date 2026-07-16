import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { runDueActions } from "@/lib/ai-execution";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AI実行キューのtick（DECISIONS #62）。
 * scheduled_at を過ぎた queued アクションを拾って実行する。
 * Vercel Cron（vercel.json, 10分ごと）から。認証: Authorization: Bearer ${CRON_SECRET}
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
      const r = await runDueActions(admin, String(c.id));
      results.push({ company: c.id, ...r });
    } catch (e) {
      results.push({ company: c.id, error: String(e) });
    }
  }
  return NextResponse.json({ ok: true, results });
}
