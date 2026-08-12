import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";

export type Permission =
  | "manage_company"
  | "manage_org"
  | "manage_staff"
  | "manage_templates"
  | "create_shifts"
  | "edit_attendance"
  | "view_payroll"
  | "manage_payroll"
  | "view_hq"
  | "manage_announcements"
  | "approve_suggestions"
  | "manage_kiosks"
  | "view_audit";

export type Actor = {
  staffId: string;
  authUserId: string;
  companyId: string;
  name: string;
  email: string | null;
  permissions: Partial<Record<Permission | "read_only", boolean>>;
  storeIds: string[];
  primaryStoreId: string | null;
};

/** ログインID→擬似メール変換（DECISIONS #2） */
export function loginIdToEmail(loginId: string) {
  return `${loginId.toLowerCase()}@staff.yozan.internal`;
}

/**
 * 認証に使うメール（Auth側のemail）を決める正典。
 * ログイン画面 login/actions.ts と同じルール:
 *   ログインIDが入っていればそれ（@付きならそのままメール扱い）、無ければメールアドレス。
 * ※ここが staff テーブルと auth.users でズレると「設定したIDで入れない」事故になる。
 */
export function authEmailFor(email?: string | null, loginId?: string | null): string | null {
  const id = (loginId ?? "").trim();
  if (id) return id.includes("@") ? id.toLowerCase() : loginIdToEmail(id);
  const e = (email ?? "").trim();
  return e ? e.toLowerCase() : null;
}

export async function getActor(): Promise<Actor | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdmin();
  const { data: staff } = await admin
    .from("staff")
    .select("id, company_id, name, email, status")
    .eq("auth_user_id", user.id)
    .is("deleted_at", null)
    .single();
  if (!staff || staff.status !== "active") return null;

  const [{ data: roleRows }, { data: assigns }] = await Promise.all([
    admin
      .from("staff_roles")
      .select("roles(permissions)")
      .eq("staff_id", staff.id)
      .is("deleted_at", null),
    admin
      .from("staff_store_assignments")
      .select("store_id, is_primary")
      .eq("staff_id", staff.id)
      .is("deleted_at", null),
  ]);

  const permissions: Actor["permissions"] = {};
  for (const row of roleRows ?? []) {
    const perms = (row as unknown as { roles: { permissions: Record<string, boolean> } | null })
      .roles?.permissions;
    if (perms) Object.assign(permissions, perms);
  }

  return {
    staffId: staff.id,
    authUserId: user.id,
    companyId: staff.company_id,
    name: staff.name,
    email: staff.email,
    permissions,
    storeIds: (assigns ?? []).map((a) => a.store_id),
    primaryStoreId: (assigns ?? []).find((a) => a.is_primary)?.store_id ?? null,
  };
}

export function can(actor: Actor, perm: Permission) {
  if (actor.permissions.read_only) return false;
  return !!actor.permissions[perm];
}

/** オーナー（最高権限）= manage_company。全店舗を横断できる唯一の立場 */
export function isOwner(actor: Actor) {
  return !actor.permissions.read_only && !!actor.permissions.manage_company;
}

/**
 * 管理画面で見せてよい店舗（店舗またぎ事故の防止）。
 * オーナー = 会社の全店舗 / それ以外 = 配属店舗（staff_store_assignments）のみ。
 * 店舗が1つなら切替タブは自然に消える（map描画のため）。
 */
export async function visibleStores(actor: Actor): Promise<Array<{ id: string; name: string }>> {
  if (!isOwner(actor) && actor.storeIds.length === 0) return [];
  const admin = createAdmin();
  let q = admin
    .from("stores")
    .select("id, name")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("name");
  if (!isOwner(actor)) q = q.in("id", actor.storeIds);
  const { data } = await q;
  return (data ?? []) as Array<{ id: string; name: string }>;
}

/** .in() に空配列を渡すとクエリが壊れるため、絶対に一致しないUUIDを使う（#134） */
export const NO_STORE = "00000000-0000-0000-0000-000000000000";

/**
 * 一覧の絞り込みに使う店舗ID（#134）。
 * オーナー = 自社の全店舗 / それ以外 = 配属店舗のみ（visibleStores と同じ判定）。
 * 該当なしのときは NO_STORE を1件返す（空配列を .in() に渡すと全件になる/壊れるため）。
 */
export async function scopedStoreIds(actor: Actor): Promise<string[]> {
  const ids = (await visibleStores(actor)).map((s) => s.id);
  return ids.length > 0 ? ids : [NO_STORE];
}

/**
 * クライアントから渡ってきた store_id の検証（#134）。
 * サーバーアクションは UI の出し分けを信用してはいけない（フォームの hidden も引数も改竄できる）。
 * オーナー = 自社の店舗ならOK / それ以外 = 配属店舗のみ。外れたら例外で止める。
 */
export async function assertStoreAccess(actor: Actor, storeId: string | null | undefined): Promise<string> {
  const id = (storeId ?? "").trim();
  // オーナーも「自社の店舗か」はDBで確認する（他テナントの店舗IDを差し込まれないように）
  const ok = id !== "" && (isOwner(actor)
    ? (await visibleStores(actor)).some((s) => s.id === id)
    : actor.storeIds.includes(id));
  if (!ok) throw new Error("FORBIDDEN: store");
  return id;
}

/** ?store= の直打ち対策: 見せてよい店舗に含まれる値だけ採用（外れは主店舗→先頭） */
export function pickStore(
  stores: Array<{ id: string; name: string }>,
  requested: string | undefined,
  primaryStoreId?: string | null,
): string | undefined {
  if (requested && stores.some((s) => s.id === requested)) return requested;
  if (primaryStoreId && stores.some((s) => s.id === primaryStoreId)) return primaryStoreId;
  return stores[0]?.id;
}

export function isAdmin(actor: Actor) {
  return (
    ["manage_staff", "manage_org", "create_shifts", "edit_attendance", "view_payroll"] as Permission[]
  ).some((p) => !!actor.permissions[p]);
}

/** 認証必須。permを渡すと権限チェックも行う */
export async function requireActor(perm?: Permission): Promise<Actor> {
  const actor = await getActor();
  // denied=1: セッションはあるがスタッフ照合に失敗（権限なし・別会社等）。
  // 素の /login へ飛ばすと middleware が / に戻して無限ループするため denied を付ける
  if (!actor) redirect("/login?denied=1");
  if (perm && !can(actor, perm)) throw new Error("FORBIDDEN: " + perm);
  return actor;
}
