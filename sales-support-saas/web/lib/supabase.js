import { createClient } from "@supabase/supabase-js";

// サーバー専用クライアント（service_role）。schema=sales_os を既定に。
// service_role キーは絶対にクライアントへ渡さない。
let _client = null;

export function db() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase の環境変数が未設定です (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "sales_os" },
  });
  return _client;
}
