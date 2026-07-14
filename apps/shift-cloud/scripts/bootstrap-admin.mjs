/**
 * 初期管理者（会社オーナー）を作成するスクリプト
 * 使い方:
 *   cd apps/shift-cloud
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/bootstrap-admin.mjs <メールアドレス> <パスワード> <氏名>
 * 例:
 *   node scripts/bootstrap-admin.mjs hiro0413022@gmail.com MyPassword123 "比呂"
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://qrgpblnnhdudigarrtuz.supabase.co";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const [email, password, name] = process.argv.slice(2);

if (!KEY) { console.error("環境変数 SUPABASE_SERVICE_ROLE_KEY を設定してください"); process.exit(1); }
if (!email || !password || !name) { console.error("使い方: node scripts/bootstrap-admin.mjs <email> <password> <氏名>"); process.exit(1); }

const admin = createClient(URL, KEY, { auth: { persistSession: false } });

const { data: company } = await admin.from("companies").select("id, name").limit(1).single();
if (!company) { console.error("会社データがありません（0003_seed未適用？）"); process.exit(1); }

const { data: ownerRole } = await admin.from("roles").select("id").eq("company_id", company.id).eq("name", "会社オーナー").single();
const { data: stores } = await admin.from("stores").select("id, name").eq("company_id", company.id).is("deleted_at", null);

const { data: authUser, error: authErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (authErr) { console.error("Authユーザー作成失敗:", authErr.message); process.exit(1); }

const { data: staff, error: staffErr } = await admin.from("staff").insert({
  company_id: company.id,
  auth_user_id: authUser.user.id,
  name,
  email,
  employment_type: "fulltime",
  position: "オーナー",
}).select("id").single();
if (staffErr) { console.error("スタッフ作成失敗:", staffErr.message); process.exit(1); }

await admin.from("staff_roles").insert({
  company_id: company.id, staff_id: staff.id, role_id: ownerRole.id, scope_type: "company",
});
if (stores?.length) {
  await admin.from("staff_store_assignments").insert(
    stores.map((s, i) => ({ company_id: company.id, staff_id: staff.id, store_id: s.id, is_primary: i === 0 }))
  );
}
await admin.from("audit_logs").insert({
  company_id: company.id, actor_type: "system", action: "bootstrap.admin",
  table_name: "staff", record_id: staff.id, after: { email, name },
});

console.log(`✓ 完了: ${company.name} のオーナー「${name}」(${email}) を作成しました`);
console.log("  ログイン → 全店舗に所属・全権限付与済み");
