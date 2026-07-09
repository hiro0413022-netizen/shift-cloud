import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "./session";
import { db } from "./supabase";

const PROJ_COOKIE = "sos_project";

// ログイン必須ページ用。セッション＋テナントの商品一覧＋現在の商品を返す。
export async function requireCtx() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supa = db();
  const { data: projects } = await supa
    .from("projects")
    .select("*")
    .eq("tenant_id", session.tenantId)
    .eq("is_active", true)
    .order("sort");

  const list = projects || [];
  let projectId = cookies().get(PROJ_COOKIE)?.value;
  if (!projectId || !list.find((p) => p.id === projectId)) {
    projectId = list[0]?.id || null;
  }
  const project = list.find((p) => p.id === projectId) || null;

  return { session, supa, projects: list, project, projectId };
}

export function setActiveProjectCookie(projectId) {
  cookies().set(PROJ_COOKIE, projectId, { path: "/", maxAge: 60 * 60 * 24 * 365 });
}
