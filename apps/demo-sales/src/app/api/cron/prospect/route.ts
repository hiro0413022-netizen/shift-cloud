// 営業先の自動ピックアップ（Vercel Cron / #110）
//
// これが「パソコンを閉じていても営業先が増える」実体。ブラウザ操作でもローカル実行でもなく、
// Vercel側のcronが叩く（#107で決めた恒久ルール: 外部への発信・定期処理はcronに載せる）。
//
// 認証: Authorization: Bearer ${CRON_SECRET}（Genesis の cron と同じ方式）。
// middleware では /api/cron を公開プレフィックスにしてあるが、認可はこのファイルが行う。

import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@yozan/core/supabase/admin";
import { runProspectPickup } from "@yozan/prospect/server";
import { createAutoDemo } from "@/lib/auto-demo";

export const dynamic = "force-dynamic";
// 外部サイトの取得は遅い。1回で終わらせる前提を置かず、予算内で進めて次のcronに続きを渡す。
export const maxDuration = 300;

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
    const companyId = String(c.id);
    try {
      const r = await runProspectPickup(admin, companyId, {
        budgetMs: Number(process.env.PROSPECT_BUDGET_MS ?? 240_000),
        maxNewProspects: Number(process.env.PROSPECT_MAX_NEW ?? 30),
        maxAudits: Number(process.env.PROSPECT_MAX_AUDITS ?? 25),
        demoScoreMin: Number(process.env.PROSPECT_DEMO_SCORE_MIN ?? 55),
        maxDemos: Number(process.env.PROSPECT_MAX_DEMOS ?? 3),
        onDemo: (p) => createAutoDemo(admin, companyId, p),
      });
      results.push({ company: companyId, ...r });
    } catch (e) {
      results.push({ company: companyId, error: String(e) });
    }
  }
  return NextResponse.json({ ok: true, results });
}
