import "server-only";
import { createAdmin } from "@/lib/supabase/admin";
import type { GenesisActor } from "@/lib/auth";
import { baseContext, enrichContext, type CoreActor, type GenesisContext, type Surface } from "@yozan/genesis-core/context";

/* ============================================================
   Genesis 側の Actor / Context 組み立て（Final Architecture §4）

   GenesisActor（画面用）→ CoreActor（Policy 用・permissions 付き）。
   Context の組み立てはここで一度だけ。Tool には ctx.context として渡る。
   ============================================================ */

type Admin = ReturnType<typeof createAdmin>;

async function permissionsOf(admin: Admin, staffId: string): Promise<string[]> {
  const { data } = await admin.from("staff_roles").select("roles(permissions)").eq("staff_id", staffId).is("deleted_at", null);
  const set = new Set<string>();
  for (const row of (data ?? []) as unknown as Array<{ roles: { permissions: Record<string, boolean> | null } | null }>) {
    for (const [k, v] of Object.entries(row.roles?.permissions ?? {})) if (v) set.add(k);
  }
  return [...set];
}

export async function toCoreActor(admin: Admin, actor: GenesisActor, kind: CoreActor["kind"] = "human"): Promise<CoreActor> {
  return {
    staffId: actor.staffId,
    name: actor.name,
    kind,
    isOwner: actor.isOwner,
    permissions: await permissionsOf(admin, actor.staffId),
    storeIds: actor.storeIds,
    primaryStoreId: actor.primaryStoreId,
  };
}

/** staff.id から CoreActor（承認後の実行キュー・MCP 代理実行で使う。画面セッションが無い） */
export async function coreActorFromStaffId(admin: Admin, companyId: string, staffId: string | null): Promise<CoreActor> {
  if (!staffId) {
    // 起点が人でない（cron / 自律ループ）。Policy は「代理元なしの AI」として更新以上を承認に倒す
    return { staffId: null, name: "Genesis", kind: "ai", isOwner: true, permissions: ["manage_company"], storeIds: [], primaryStoreId: null, onBehalfOf: null };
  }
  const { data: staff } = await admin.from("staff").select("id, name, company_id").eq("id", staffId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  const permissions = await permissionsOf(admin, staffId);
  const isOwner = permissions.includes("manage_company") && !permissions.includes("read_only");
  let storeIds: string[] = [];
  let primaryStoreId: string | null = null;
  if (isOwner) {
    const { data: stores } = await admin.from("stores").select("id").eq("company_id", companyId).eq("status", "active").is("deleted_at", null).order("created_at");
    storeIds = ((stores ?? []) as Array<{ id: string }>).map((s) => s.id);
    primaryStoreId = storeIds[0] ?? null;
  } else {
    const { data: rows } = await admin.from("staff_store_assignments").select("store_id, is_primary").eq("staff_id", staffId).is("deleted_at", null);
    const list = (rows ?? []) as Array<{ store_id: string; is_primary: boolean }>;
    storeIds = list.map((r) => r.store_id);
    primaryStoreId = list.find((r) => r.is_primary)?.store_id ?? storeIds[0] ?? null;
  }
  return { staffId, name: staff?.name ? String(staff.name) : "staff", kind: "human", isOwner, permissions, storeIds, primaryStoreId };
}

export async function buildGenesisContext(
  admin: Admin,
  actor: CoreActor,
  companyId: string,
  opts: { surface?: Surface; storeId?: string | null; enrich?: boolean; focus?: { store?: string | null; project?: string | null } | null } = {}
): Promise<GenesisContext> {
  const { data: company } = await admin.from("companies").select("id, name").eq("id", companyId).maybeSingle();
  let store: GenesisContext["store"] = null;
  // Focus（#304）: 店舗を明示していなければ Focus の店舗を使う。案件は ctx.project / focus.projectId に
  const storeId = opts.storeId ?? opts.focus?.store ?? null;
  if (storeId) {
    const { data: s } = await admin.from("stores").select("id, name").eq("id", storeId).maybeSingle();
    if (s) store = { id: String(s.id), name: String(s.name) };
  }
  const focus = opts.focus?.store || opts.focus?.project ? { ...(opts.focus?.store ? { stores: [opts.focus.store] } : {}), ...(opts.focus?.project ? { projectId: opts.focus.project } : {}) } : null;
  const ctx = baseContext({ actor, company: { id: companyId, name: String(company?.name ?? ""), kind: "operating" }, surface: opts.surface ?? "web", store, focus });
  if (opts.focus?.project) {
    const { data: p } = await admin.from("gn_projects").select("id, name").eq("id", opts.focus.project).eq("company_id", companyId).maybeSingle();
    if (p) ctx.project = { id: String(p.id), name: String(p.name) };
  }
  return opts.enrich === false ? ctx : enrichContext(admin, ctx);
}
