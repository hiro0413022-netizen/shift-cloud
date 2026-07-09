import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * service_roleクライアント（RLSバイパス）。
 * 公開ルート（予約申込）や、requireReserveActor()で権限確認済みの管理操作でのみ使用する。
 */
export function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
