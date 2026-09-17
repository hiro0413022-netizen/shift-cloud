// 公開してよい値だけ（Supabase の anon キーはブラウザに出る前提のキー）。
// 権限はすべてDB側の hp_* RPC がセッショントークンで検査する。
export const SB_URL = "https://qrgpblnnhdudigarrtuz.supabase.co";
export const SB_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyZ3BibG5uaGR1ZGlnYXJydHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NjQ1MzMsImV4cCI6MjA5ODU0MDUzM30.rOSGad36v_RoeBAbzSwCoi0imIc4zRwZ7Ub88EAHSCw";
