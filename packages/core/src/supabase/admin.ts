import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * service_roleクライアント（RLSバイパス）。
 * 管理操作は requireActor() で権限確認した後にのみ使用（DECISIONS #11, #18）。
 * 公開ルートはトークン/slug検証を挟んで使用（#12/#23と同型）。
 */
export function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
