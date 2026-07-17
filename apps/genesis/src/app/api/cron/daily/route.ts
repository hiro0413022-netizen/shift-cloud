import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { runDailyCeoReport } from "@/lib/ceo-ai";
import { runDueActions } from "@/lib/ai-execution";

export const dynamic = "force-dynamic";
// 60秒だとAI社員の成果物生成が入った時点で504になり、レポートが丸ごと欠落した（2026-07-15〜17）。
// レポート本体は先に保存する構成（lib/ceo-ai.ts）に変えた上で、後工程のぶんの余裕を持たせる。
export const maxDuration = 300;

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
      // 日次生成のついでに、溜まっているAI実行キューも1回tickする（#62）
      const exec = await runDueActions(admin, String(c.id));
      results.push({ company: c.id, ...r, executed: exec });
    } catch (e) {
      results.push({ company: c.id, error: String(e) });
    }
  }
  return NextResponse.json({ ok: true, results });
}
