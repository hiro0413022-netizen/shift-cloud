import "server-only";
import { cookies } from "next/headers";
import { createAdmin } from "@/lib/supabase/admin";
import type { GenesisActor } from "@/lib/auth";
import { visibleStores } from "@/lib/auth";
import { EMPTY_FOCUS, FOCUS_COOKIE, parseFocus, serializeFocus, type Focus } from "./focus-pure";

export type FocusView = Focus & { storeName: string | null; projectName: string | null; stores: Array<{ id: string; name: string }>; projects: Array<{ id: string; name: string; slug: string }> };

/** cookie から Focus を読む（許可された店舗・案件だけ有効）。失敗しても空の Focus */
export async function readFocus(actor: GenesisActor): Promise<FocusView> {
  try {
    const admin = createAdmin();
    const [stores, { data: pr }, jar] = await Promise.all([
      visibleStores(actor).catch(() => [] as Array<{ id: string; name: string }>),
      admin.from("gn_projects").select("id, name, slug").eq("company_id", actor.companyId).eq("status", "active").is("deleted_at", null).order("updated_at", { ascending: false }).limit(30),
      cookies(),
    ]);
    const projects = ((pr ?? []) as Array<{ id: string; name: string; slug: string }>);
    const f = parseFocus(jar.get(FOCUS_COOKIE)?.value, { stores: stores.map((s) => s.id), projects: projects.map((p) => p.id), canCeo: actor.isOwner });
    return { ...f, storeName: stores.find((s) => s.id === f.store)?.name ?? null, projectName: projects.find((p) => p.id === f.project)?.name ?? null, stores, projects };
  } catch {
    return { ...EMPTY_FOCUS, storeName: null, projectName: null, stores: [], projects: [] };
  }
}

export async function writeFocus(f: Focus): Promise<void> {
  const jar = await cookies();
  jar.set(FOCUS_COOKIE, serializeFocus(f), { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
}
