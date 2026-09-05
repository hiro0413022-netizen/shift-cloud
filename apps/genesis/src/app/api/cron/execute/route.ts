import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { runDueActions } from "@/lib/ai-execution";
import { publishDueContent } from "@/lib/content-loop";
import { listOperatingCompanyIds } from "@/lib/operating-companies";
import { runFrankAutoVisited, runFrankAutoCheckout } from "@/lib/frank-visit-cron";

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
      results.push({ company: c.id, ...r, sns });
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
  return NextResponse.json({ ok: true, results, frankVisited, frankCheckout });
}
