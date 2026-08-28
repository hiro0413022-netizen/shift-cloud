import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase/admin";
import { devQueueAuth } from "@/lib/dev-queue-auth";

/* ============================================================
   取り込み待ちのパッチを渡す（migration 0134 / DECISIONS #183）

   叩くのは古川さんのPCの `apply-dev-queue.ps1` だけ。
   ブラウザから開くものではないので、認証はログインではなく共有シークレット
   （DEV_QUEUE_SECRET、無ければ CRON_SECRET）にする＝ /api/cron と同じ形。

   ⚠ このリポジトリは public なので、スクリプト側にシークレットを書かない。
      ps1 は `%USERPROFILE%\.yozan\dev-queue.key` から読む。

   検証を通っていないもの（verified が空）は返さない。
   クラウド側が tsc とテストを通せなかった実装を、
   古川さんのPCが黙って main に載せてしまわないための線。
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const deny = devQueueAuth(req);
  if (deny) return deny;

  const admin = createAdmin();
  const { data, error } = await admin
    .from("gn_dev_requests")
    .select("id, title, said, base_sha, verified, result_note, files_changed, patch, created_at")
    .eq("status", "done")
    .not("patch", "is", null)
    .is("applied_at", null)
    .order("created_at", { ascending: true })
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // verified が空＝クラウド側で検証が通っていない。取り込ませない。
  const items = (data ?? []).filter((r) => String(r.verified ?? "").trim() !== "");

  return NextResponse.json({ count: items.length, items }, { headers: { "cache-control": "no-store" } });
}
