import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * service_roleクライアント（RLSバイパス）。
 * 必ず requireGenesisActor() で権限チェックした後にのみ使用すること（DECISIONS #11, #18）。
 */
export function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
