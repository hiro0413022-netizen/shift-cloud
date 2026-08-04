import { createAdmin } from "@/lib/supabase/admin";
import { createTrackHandler } from "@yozan/track/route";

/**
 * 閲覧計測の受信（@yozan/track #95）。genesisでは集客LP（/lp/*）のビーコンが叩く。
 * middleware の PUBLIC_PREFIXES に "/api/track" を登録済み（登録漏れは #90 の事故）。
 */
export const dynamic = "force-dynamic";

export const POST = createTrackHandler(() => createAdmin());
