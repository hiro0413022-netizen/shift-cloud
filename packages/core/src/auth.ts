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

    return {
      staffId: staff.id,
      authUserId: user.id,
      companyId: staff.company_id,
      name: staff.name,
      email: staff.email,
    };
  });

  const requireActor = async (): Promise<Actor> => {
    const actor = await getActor();
    if (!actor) redirect(deniedPath);
    return actor;
  };

  return { getActor, requireActor };
}
