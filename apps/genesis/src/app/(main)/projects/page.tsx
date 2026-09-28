import Link from "next/link";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, Field, inputCls, btnCls } from "@/components/ui";
import { createProject } from "./actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "default" | "danger" }> = {
  active: { label: "進行中", tone: "ok" }, paused: { label: "保留", tone: "warn" }, done: { label: "完了", tone: "default" }, cancelled: { label: "中止", tone: "danger" },
};

/** Projects（#303）— 案件の入口。記憶（project スコープ）・待ち・開発依頼・判断・メモを1つに束ねる */
export default async function ProjectsPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const { data } = await admin.from("gn_projects").select("id, name, slug, goal, status, due_on, updated_at").eq("company_id", actor.companyId).is("deleted_at", null).order("status").order("updated_at", { ascending: false }).limit(100);
  const projects = (data ?? []) as Array<{ id: string; name: string; slug: string; goal: string | null; status: string; due_on: string | null; updated_at: string }>;
  const { data: items } = await admin.from("gn_project_items").select("project_id").eq("company_id", actor.companyId).is("deleted_at", null);
  const { data: mems } = await admin.from("gn_memories").select("scope_id").eq("company_id", actor.companyId).eq("scope", "project").is("deleted_at", null);
  const count = (rows: Array<Record<string, unknown>> | null, key: string) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(String(r[key]), (m.get(String(r[key])) ?? 0) + 1);
    return m;
  };
  const itemCount = count(items as Array<Record<string, unknown>> | null, "project_id");
  const memCount = count(mems as Array<Record<string, unknown>> | null, "scope_id");

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">案件</h1>
        <p className="text-sm text-(--color-dim)">進めている案件ごとに、記憶・待ち・開発依頼・判断・メモを束ねる。JARVIS に「2号店の状況」と聞くとカードで出る。</p>
      </header>

      <Panel title="案件を作る">
        <form action={createProject} className="grid gap-3 lg:grid-cols-[1fr_2fr_160px_auto]">
          <Field label="名前"><input name="name" className={inputCls} required placeholder="例: 2号店 出店計画" /></Field>
          <Field label="目的（何をもって完了か）"><input name="goal" className={inputCls} placeholder="例: 出店判断に必要な計画をそろえる" /></Field>
          <Field label="期限"><input name="due_on" type="date" className={inputCls} /></Field>
          <div className="self-end"><button className={btnCls}>作る</button></div>
        </form>
      </Panel>

      <Panel title={`案件一覧（${projects.length}）`}>
        {projects.length === 0 ? (
          <Empty>まだ案件がありません</Empty>
        ) : (
          <ul className="divide-y divide-(--color-line)">
            {projects.map((p) => {
              const st = STATUS[p.status] ?? STATUS.active;
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                  <Link href={`/projects/${p.slug}`} className="font-bold hover:underline">{p.name}</Link>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <span className="min-w-0 flex-1 truncate text-sm text-(--color-dim)">{p.goal ?? ""}</span>
                  {p.due_on ? <span className="text-xs text-(--color-faint)">期限 {p.due_on}</span> : null}
                  <span className="text-xs text-(--color-faint)">記憶 {memCount.get(p.id) ?? 0} · 紐づき {itemCount.get(p.id) ?? 0}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
