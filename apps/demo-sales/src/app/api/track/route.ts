import { createAdmin } from "@yozan/core/supabase/admin";
import { createTrackHandler } from "@yozan/track/route";

// デモ閲覧の計測受信（公開・トークン照合はRPC側 trk_record が実施）
// middleware の publicPrefixes に "/api/track" を登録済み
export const POST = createTrackHandler(() => createAdmin());
