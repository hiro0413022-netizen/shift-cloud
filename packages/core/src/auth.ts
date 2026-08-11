import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { createAdmin } from "./supabase/admin";

/**
 * 共通アクター解決（独立アプリの勝ちパターン用 / DECISIONS #27,#30,#33,#34と同型）。
 * ロール・権限データはGenesis/Shift Cloudと共通（同一DB）。
 *
 * 使い方（各アプリの src/lib/auth.ts）:
 *   import { createActorResolver } from "@yozan/core/auth";
 *   export const { getActor, requireActor } = createActorResolver({ anyOf: ["use_xxx", "view_hq"] });
 */

export type Actor = {
  staffId: string;
  authUserId: string;
  companyId: string;
  name: string;
  email: string | null;
  /** オーナー（最高権限）。manage_company 権限を持つ人だけ true。全店舗を横断できる */
  isOwner: boolean;
  /** 所属店舗（staff_store_assignments）。オーナーは会社の全店舗（active のみ） */
  storeIds: string[];
  /** 主所属（is_primary）。無ければ先頭 */
  primaryStoreId: string | null;
};

/** ログインID→擬似メール変換（DECISIONS #2） */
export function loginIdToEmail(loginId: string) {
  return `${loginId.toLowerCase()}@staff.yozan.internal`;
}

export function createActorResolver(options: {
  /** このいずれかの権限を持てばアクセス可（view_hq を含めるのが通例 #18） */
  anyOf: string[];
  /** 拒否時のリダイレクト先（既定: /login?denied=1） */
  deniedPath?: string;
}) {
  const deniedPath = options.deniedPath ?? "/login?denied=1";

  const getActor = cache(async (): Promise<Actor | null> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = createAdmin();
    const { data: staffData } = await admin
      .from("staff")
      .select("id, company_id, name, email, status, staff_roles(deleted_at, roles(permissions))")
      .eq("auth_user_id", user.id)
      .is("deleted_at", null)
      .single();

    // Supabaseのネスト取得の型推論に依存せず、自前の型に確定させる（環境差による型エラー回避）
    type StaffShape = {
      id: string;
      company_id: string;
      name: string;
      email: string | null;
      status: string;
      staff_roles?: Array<{
        deleted_at: string | null;
        roles: { permissions: Record<string, boolean> | null } | null;
      }>;
    };
    const staff = staffData as unknown as StaffShape | null;
    if (!staff || staff.status !== "active") return null;

    const roleRows = (staff.staff_roles ?? []).filter((r) => r.deleted_at == null);
    const hasAccess = roleRows.some((row) => {
      const perms = row.roles?.permissions;
      if (!perms || perms.read_only) return false;
      return options.anyOf.some((p) => !!perms[p]);
    });
    if (!hasAccess) return null;

    // オーナー判定は manage_company（会社オーナーロールのみが持つ）。view_hq は「本部」も持つので使わない
    const isOwner = roleRows.some((row) => {
      const perms = row.roles?.permissions;
      return !!perms && !perms.read_only && !!perms.manage_company;
    });

    // 店舗スコープ: オーナー＝会社の全店舗、それ以外＝所属店舗のみ（店舗またぎ事故の防止）
    let storeIds: string[] = [];
    let primaryStoreId: string | null = null;
    if (isOwner) {
      const { data: stores } = await admin
        .from("stores")
        .select("id")
        .eq("company_id", staff.company_id)
        .eq("status", "active")
        .is("deleted_at", null);
      storeIds = (stores ?? []).map((s: { id: string }) => s.id);
      primaryStoreId = storeIds[0] ?? null;
    } else {
      const { data: assigns } = await admin
        .from("staff_store_assignments")
        .select("store_id, is_primary")
        .eq("staff_id", staff.id)
        .is("deleted_at", null);
      const rows = (assigns ?? []) as Array<{ store_id: string; is_primary: boolean | null }>;
      storeIds = rows.map((r) => r.store_id);
      primaryStoreId = rows.find((r) => r.is_primary)?.store_id ?? storeIds[0] ?? null;
    }

    return {
      staffId: staff.id,
      authUserId: user.id,
      companyId: staff.company_id,
      name: staff.name,
      email: staff.email,
      isOwner,
      storeIds,
      primaryStoreId,
    };
  });

  const requireActor = async (): Promise<Actor> => {
    const actor = await getActor();
    if (!actor) redirect(deniedPath);
    return actor;
  };

  return { getActor, requireActor };
}
