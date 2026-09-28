import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { runDueActions } from "@/lib/ai-execution";
import { publishDueContent } from "@/lib/content-loop";
import { listOperatingCompanyIds } from "@/lib/operating-companies";
import { runFrankAutoVisited, runFrankAutoCheckout } from "@/lib/frank-visit-cron";
import { runBillingDaySweep } from "@/lib/frank-billing-day";
import { runSchedulerTick, withJobRun } from "@yozan/genesis-core/scheduler";
import { runRuleAct, runWorkflowForEvent } from "@/core/run";
import { indexSemantic } from "@yozan/genesis-core/semantic";
import { embedTexts, hasEmbedKey } from "@yozan/genesis-core/embed";

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
  // 店舗を持つ会社だけ回す（#134c・cron/daily と同じ理由）
  const companyIds = await listOperatingCompanyIds(admin);
  const results = [];
  for (const id of companyIds) {
    const c = { id };
    try {
      const r = await runDueActions(admin, String(c.id));
      // 承認済みSNS投稿の時刻到来分をInstagramへ（#101・IG未設定なら注記のみでスキップ）
      const sns = await publishDueContent(admin, String(c.id)).catch((e) => ({ error: String(e) }));
      // Genesis Core Scheduler（#292）: イベント処理・Proactive ルール・Waiting の期限。LLM は使わない
      const core = await runSchedulerTick(admin, String(c.id), {
        // ルールの Act（#294）: Core を通す＝AI Actor の Policy で risk>=2 は承認カードになる
        act: (a) => runRuleAct(admin, { companyId: a.companyId, tool: a.tool, input: a.input, title: String(a.rule.name ?? a.tool), dedupeKey: `${a.dedupeKey}:act` }),
        // Workflow（#298）: イベント → 宣言された手順を Core 経由で
        runWorkflow: (wf, ev) => runWorkflowForEvent(admin, wf, ev),
      }).catch((e) => ({ error: String(e) }));
      // Semantic Search の増分取り込み（#300）: 1 tick 150 本まで（429 の再試行込みで maxDuration 60秒に収める。4万件は約2日）。GEMINI_API_KEY が無ければ何もしない
      const embed = hasEmbedKey()
        ? await withJobRun(admin, "embed:index", String(c.id), () => indexSemantic(admin, String(c.id), (t, k) => embedTexts(t, k, { admin, companyId: String(c.id) }), { budget: Number(process.env.GENESIS_EMBED_BUDGET ?? 150) })).catch((e) => ({ error: String(e) }))
        : { skipped: "GEMINI_API_KEY 未設定" };
      results.push({ company: c.id, ...r, sns, core, embed });
    } catch (e) {
      results.push({ company: c.id, error: String(e) });
    }
  }
  /* FRANK: 終了時刻を過ぎた予約を自動で「来店」にする（#205）。
     10分ごとに回るこのtickに乗せることで、**レッスンが終われば最大10分で来店になる**
     （翌朝までのタイムラグを作らない）。会社ループの外＝1回だけ。 */
  const frankVisited = await runFrankAutoVisited().catch((e) => ({ error: String(e) }));
  /* FRANK: 利用時間を過ぎた在店を自動で「退店」にする（#220）。
     【退店】の押し忘れで来店中が残り続けていた。お客様のスマホ側は同じ規則で
     すでに閉じているので、DBを画面に合わせる。 */
  const frankCheckout = await runFrankAutoCheckout().catch((e) => ({ error: String(e) }));
  /* FRANK: 入会したのに「毎月10日に翌月分」に作り直せていない方を拾い直す（#235）。
     入会の Webhook が応答後に走らせる作り直しの取りこぼし用。1回2名まで */
  const frankBillingDay = await runBillingDaySweep(2).catch((e) => ({ error: String(e) }));
  // tick 自体の記録（Self Healing が「10分ごとに走っているか」を見る）
  await withJobRun(admin, "cron:execute", null, async () => ({ companies: companyIds.length })).catch(() => null);
  return NextResponse.json({ ok: true, results, frankVisited, frankCheckout, frankBillingDay });
}
