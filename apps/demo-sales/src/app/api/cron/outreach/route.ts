// 営業メールの自動送信（Vercel Cron / #111）
//
// ピックアップ（#110）と同じレールに載せる。ブラウザ操作でもローカル実行でもなく、
// Vercel側のcronが叩く＝パソコンを閉じていても送られる。
//
// 送る時刻は out_settings.send_hour_jst（既定10時）。cronは毎時叩き、
// 「いまがその時刻か」はここで判定する。時刻を変えるのにデプロイを要らなくするため。

import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@yozan/core/supabase/admin";
import { runOutreach } from "@yozan/outreach/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "demo-sales-delta.vercel.app"}`;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdmin();
  const hourJst = Number(new Date(Date.now() + 9 * 3600_000).toISOString().slice(11, 13));
  const { data: companies } = await admin.from("companies").select("id").is("deleted_at", null);

  const results = [];
  for (const c of companies ?? []) {
    const companyId = String(c.id);
    try {
      const { data: st } = await admin.from("out_settings").select("send_hour_jst").eq("company_id", companyId).maybeSingle();
      const want = st?.send_hour_jst ?? 10;
      // 深夜・早朝に届くのは印象が悪い。設定時刻の1時間だけ送る
      if (hourJst !== want) {
        results.push({ company: companyId, skipped: `送信時刻ではありません（今 ${hourJst}時 / 設定 ${want}時）` });
        continue;
      }
      const r = await runOutreach(admin, companyId, {
        baseUrl: APP_URL,
        demoBaseUrl: APP_URL,
        budgetMs: Number(process.env.OUTREACH_BUDGET_MS ?? 200_000),
        delayMs: Number(process.env.OUTREACH_DELAY_MS ?? 3000),
        minScore: Number(process.env.OUTREACH_MIN_SCORE ?? 55),
      });
      results.push({ company: companyId, ...r });
    } catch (e) {
      results.push({ company: companyId, error: String(e) });
    }
  }
  return NextResponse.json({ ok: true, hourJst, results });
}
