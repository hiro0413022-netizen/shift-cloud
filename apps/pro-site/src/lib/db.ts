import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** service_role クライアント（pgw_* はRLSポリシー無し=サーバー専用。DECISIONS #64/#65方針） */
export function createAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env が未設定です (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  return createClient(url, key, { auth: { persistSession: false } });
}
