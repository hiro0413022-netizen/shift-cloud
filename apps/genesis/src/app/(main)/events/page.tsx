import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, StatusDot, Empty, Field, inputCls, btnCls, fmtDate } from "@/components/ui";
import { createEvent } from "./actions";

export const dynamic = "force-dynamic";

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const actor = await requireGenesisActor();
  const { type } = await searchParams;
  const admin = createAdmin();

  let query = admin
    .from("company_events")
    .select("*")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false })
    .limit(100);
  if (type) query = query.eq("event_type", type);
  const { data: events } = await query;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Company Events</h1>
        <p className="text-sm text-[--color-dim]">会社で起きるすべての出来事のタイムライン</p>
      </header>

      <Panel title="イベントを記録">
        <form action={createEvent} className="grid gap-3 lg:grid-cols-4">
          <Field label="タイトル（必須）">
            <input name="title" className={inputCls} required />
          </Field>
          <Field label="種別">
            <input name="event_type" className={inputCls} placeholder="例: sales.lead / ops.claim" defaultValue="note" />
          </Field>
          <Field label="重要度">
            <select name="severity" className={inputCls}>
              <option value="info">info</option>
              <option value="notice">notice</option>
              <option value="warning">warning</option>
              <option value="critical">critical</option>
            </select>
          </Field>
          <div className="flex items-end">
            <button className={btnCls}>記録</button>
          </div>
          <div className="lg:col-span-4">
            <Field label="詳細（任意）">
              <textarea name="description" rows={2} className={inputCls} />
            </Field>
          </div>
        </form>
      </Panel>

      <Panel title={`タイムライン${type ? `（${type}）` : ""}`}>
        {!events || events.length === 0 ? (
          <Empty>イベントなし</Empty>
        ) : (
          <ul className="relative space-y-4 border-l border-[--color-line] pl-5">
            {events.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[26px] top-1">
                  <StatusDot
                    status={e.severity === "critical" ? "danger" : e.severity === "warning" ? "warning" : e.source_type === "ai" ? "processing" : "normal"}
                  />
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{e.title}</span>
                  <Badge>{e.event_type}</Badge>
                  <Badge tone={e.source_type === "ai" ? "accent" : "default"}>{e.source}</Badge>
                  <span className="text-xs text-[--color-dim]">{fmtDate(e.occurred_at)}</span>
                </div>
                {e.description && <p className="mt-1 text-sm text-[--color-dim]">{e.description}</p>}
                {e.ai_next_action && (
                  <p className="mt-1 text-xs text-sky-300">AI次アクション: {e.ai_next_action}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
