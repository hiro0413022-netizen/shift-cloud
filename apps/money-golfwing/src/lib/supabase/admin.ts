import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * service_roleクライアント（RLSバイパス）。
 * 必ず requireMoneyActor() で権限チェックした後にのみ使用すること。
 */
export function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
