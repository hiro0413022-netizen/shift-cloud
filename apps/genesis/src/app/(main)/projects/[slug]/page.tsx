import Link from "next/link";
import { notFound } from "next/navigation";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, Field, inputCls, btnCls, fmtDate } from "@/components/ui";
import { linkProjectItem, rememberForProject, setProjectStatus } from "../actions";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = { waiting: "待ち", devreq: "開発依頼", decision: "判断", memory: "記憶", event: "出来事", note: "メモ", link: "リンク", document: "資料" };

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const { data: p } = await admin.from("gn_projects").select("*").eq("company_id", actor.companyId).eq("slug", slug).is("deleted_at", null).maybeSingle();
  if (!p) notFound();
  const pid = String(p.id);
  const [{ data: mems }, { data: items }, { data: events }] = await Promise.all([
    admin.from("gn_memories").select("id, value, confidence, source, created_at").eq("company_id", actor.companyId).eq("scope", "project").eq("scope_id", pid).is("deleted_at", null).order("updated_at", { ascending: false }).limit(100),
    admin.from("gn_project_items").select("id, kind, ref_id, label, url, created_at").eq("company_id", actor.companyId).eq("project_id", pid).is("deleted_at", null).order("created_at", { ascending: false }).limit(200),
    admin.from("gn_events").select("occurred_at, type, payload").eq("company_id", actor.companyId).ilike("payload->>summary", `%${String(p.name).slice(0, 12)}%`).order("occurred_at", { ascending: false }).limit(20),
  ]);
  const memories = (mems ?? []) as Array<{ id: string; value: string; confidence: number; source: string | null; created_at: string }>;
  const list = (items ?? []) as Array<{ id: string; kind: string; ref_id: string | null; label: string; url: string | null; created_at: string }>;
  const ev = (events ?? []) as Array<{ occurred_at: string; type: string; payload: Record<string, unknown> | null }>;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/projects" className="text-sm text-(--color-dim) hover:underline">← 案件</Link>
        <h1 className="text-xl font-bold">{String(p.name)}</h1>
        <Badge tone={p.status === "active" ? "ok" : p.status === "paused" ? "warn" : "default"}>{String(p.status)}</Badge>
        {p.due_on ? <span className="text-xs text-(--color-faint)">期限 {String(p.due_on)}</span> : null}
        <form action={setProjectStatus} className="ml-auto flex items-center gap-2 text-xs">
          <input type="hidden" name="id" value={pid} />
          <input type="hidden" name="slug" value={slug} />
          <select name="status" defaultValue={String(p.status)} className={inputCls}>
            <option value="active">進行中</option><option value="paused">保留</option><option value="done">完了</option><option value="cancelled">中止</option>
          </select>
          <button className={btnCls}>更新</button>
        </form>
      </header>
      {p.goal ? <p className="text-sm text-(--color-dim)">目的: {String(p.goal)}</p> : null}
      <p className="text-xs text-(--color-faint)">JARVIS に「{String(p.name)}の状況」と聞くと、このページと同じ内容がカードで出ます。</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`この案件の記憶（${memories.length}）`}>
          <form action={rememberForProject} className="mb-3 flex gap-2">
            <input type="hidden" name="project_id" value={pid} />
            <input type="hidden" name="slug" value={slug} />
            <input name="value" className={inputCls} placeholder="例: 2号店は5打席・借入700万版で進める" required />
            <button className={btnCls}>覚える</button>
          </form>
          {memories.length === 0 ? <Empty>まだありません</Empty> : (
            <ul className="space-y-1 text-sm">
              {memories.map((m) => (
                <li key={m.id} className="flex items-start gap-2">
                  <span className="flex-1">{m.value}</span>
                  {Number(m.confidence) < 1 ? <Badge tone="gold">推定</Badge> : null}
                  <span className="text-[11px] text-(--color-faint)">{fmtDate(m.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={`紐づくもの（${list.length}）`}>
          <form action={linkProjectItem} className="mb-3 grid gap-2 lg:grid-cols-[120px_1fr_1fr_auto]">
            <input type="hidden" name="project" value={pid} />
            <input type="hidden" name="slug" value={slug} />
            <select name="kind" className={inputCls} defaultValue="note">
              {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input name="label" className={inputCls} placeholder="内容（1行）" required />
            <input name="url" className={inputCls} placeholder="URL（任意）" />
            <button className={btnCls}>紐づける</button>
          </form>
          {list.length === 0 ? <Empty>まだありません</Empty> : (
            <ul className="space-y-1 text-sm">
              {list.map((i) => (
                <li key={i.id} className="flex items-start gap-2">
                  <Badge>{KIND_LABEL[i.kind] ?? i.kind}</Badge>
                  <span className="flex-1">{i.url ? <a href={i.url} target="_blank" rel="noreferrer" className="hover:underline">{i.label}</a> : i.label}</span>
                  <span className="text-[11px] text-(--color-faint)">{fmtDate(i.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="最近の動き（案件名を含む出来事）">
        {ev.length === 0 ? <Empty>まだありません</Empty> : (
          <ul className="space-y-1 text-sm">
            {ev.map((e, i) => (
              <li key={i} className="flex gap-3"><span className="text-(--color-faint)">{String(e.occurred_at).slice(0, 16).replace("T", " ")}</span><span>{String(e.payload?.summary ?? e.type)}</span></li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
