import { notFound } from "next/navigation";
import { requireReceptionActor } from "@/lib/auth";
import { canAccessFrank } from "@/lib/store-scope";
import { createAdmin } from "@/lib/supabase/admin";
import { CheckinKiosk } from "./kiosk";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

/**
 * 受付チェックイン端末（#154）
 *
 * 置き方（構想 §5）: この画面を出すPCは **お客様側を向ける**。
 * 受付iPad（Square・電子伝票）はスタッフ側を向いたままなので、
 * 受付でメールや予約確認を自由に続けられる＝「他の作業に使わない」という運用ルールが要らない。
 *
 * 認可は /board と同じ考え方。(main) の外のレイアウトだが、
 * publicPrefixes には入れず、この画面で自分で確認する（店舗またぎ廃止・#134）。
 */
export default async function CheckinPage() {
  const actor = await requireReceptionActor();
  if (!canAccessFrank(actor)) notFound();

  const admin = createAdmin();
  const { data } = await admin
    .from("frunk_bays").select("id, name")
    .eq("active", true).is("deleted_at", null)
    .order("sort", { ascending: true });

  const bays = ((data ?? []) as Row[]).map((b) => ({ id: String(b.id), name: String(b.name) }));
  return <CheckinKiosk bays={bays} />;
}
