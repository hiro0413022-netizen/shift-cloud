import "server-only";
import { NextResponse } from "next/server";

/**
 * 開発依頼キューAPIの共有シークレット認証（DECISIONS #183）。
 *
 * 叩くのは古川さんのPCのスクリプトだけなので、ログインではなく Bearer。
 * `DEV_QUEUE_SECRET` を優先し、無ければ既存の `CRON_SECRET` を使う
 * ＝すぐ動かせて、あとから分けたくなったら env を足すだけで分けられる。
 *
 * どちらも未設定なら**開けっぱなしにせず 503 で閉じる**
 * （env の入れ忘れが「誰でも社内のパッチを取れる」に化けないように）。
 */
export function devQueueAuth(req: Request): NextResponse | null {
  const secret = process.env.DEV_QUEUE_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const got = req.headers.get("authorization") ?? "";
  if (got !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
