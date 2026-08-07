import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { runDailyCeoReport } from "@/lib/ceo-ai";
import { runDueActions } from "@/lib/ai-execution";
import { runSalesLoop } from "@/lib/sales-loop";
import { runActivationLoop } from "@/lib/activation-loop";
import { runAiScorecard } from "@/lib/ai-scorecard";
import { runMorningDigest } from "@/lib/morning-digest";
import { runContentLoop, refreshContentMetrics } from "@/lib/content-loop";
import { runFrankReminders } from "@/lib/frank-mail";

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
      // 後工程の予算180秒。maxDuration(300秒)より十分短くする（レポート本体は数秒で終わる）。
      const r = await runDailyCeoReport(String(c.id), "cron", {
        afterworkBudgetMs: Number(process.env.DAILY_AFTERWORK_BUDGET_MS ?? 180_000),
      });
      // 日次生成のついでに、溜まっているAI実行キューも1回tickする（#62）
      const exec = await runDueActions(admin, String(c.id));
      // 営業AIループ（#77）: 体験不足を検知したら配信依頼を起案（approval→ホーム判断フィードへ）
      const sales = await runSalesLoop(String(c.id)).catch((e) => ({ error: String(e) }));
      // SNSインバウンド（#101）: 投稿案を生成→判断フィードへ（承認→18:00に自動投稿）
      const content = await runContentLoop(String(c.id)).catch((e) => ({ error: String(e) }));
      // Xの反応数の取り込み（#109）: 1日1回だけ。10分tickでやると読み取り課金が30倍以上になる
      const metrics = await refreshContentMetrics(admin, String(c.id)).catch((e) => ({ error: String(e) }));
      // 稼働化プログラム（#82・毎週月曜のみ実行）
      const activation = await runActivationLoop(String(c.id)).catch((e) => ({ error: String(e) }));
      // AI週次成績表（#83・毎週月曜のみ実行）
      const scorecard = await runAiScorecard(String(c.id)).catch((e) => ({ error: String(e) }));
      // 朝の個人LINEダイジェスト（#83・毎日。宛先未設定なら自動skip）
      const digest = await runMorningDigest(String(c.id)).catch((e) => ({ error: String(e) }));
      results.push({ company: c.id, ...r, executed: exec, salesLoop: sales, contentLoop: content, snsMetrics: metrics, activation, scorecard, digest });
    } catch (e) {
      results.push({ company: c.id, error: String(e) });
    }
  }
  // FRANK 明日の予約リマインダーメール（#118・会社ループの外＝1回だけ。RESEND未設定なら自動skip）
  const frankReminders = await runFrankReminders().catch((e) => ({ error: String(e) }));
  return NextResponse.json({ ok: true, results, frankReminders });
}
