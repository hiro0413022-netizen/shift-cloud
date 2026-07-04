import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, StatusDot, Empty, fmtDate, severityTone } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const [{ data: agents }, { data: logs }] = await Promise.all([
    admin.from("ai_agents").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("risk_level", { ascending: false }).order("code"),
    admin
      .from("ai_execution_logs")
      .select("*, ai_agents(name)")
      .eq("company_id", actor.companyId)
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(30),
  ]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">AI Agent Workforce</h1>
        <p className="text-sm text-[--color-dim]">
          専門AIチームの台帳と実行ログ。実行は各AIツール（Cowork/n8n等）が担い、結果をここに記録する
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(agents ?? []).map((a) => (
          <div key={a.id} className="rounded-xl border border-[--color-line] bg-[--color-panel] p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium">
                <StatusDot status={a.current_status} />
                {a.name}
              </span>
              <Badge tone={severityTone(a.risk_level)}>risk: {a.risk_level}</Badge>
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-[--color-dim]">{a.role}</p>
            <div className="mt-3 space-y-1 text-xs text-[--color-dim]">
              <p>状態: {statusJa(a.current_status)}{a.current_task ? ` — ${a.current_task}` : ""}</p>
              <p>最終実行: {a.last_run_at ? fmtDate(a.last_run_at) : "未実行"}</p>
              {Array.isArray(a.approval_required_actions) && a.approval_required_actions.length > 0 && (
                <p className="text-purple-300">要承認: {a.approval_required_actions.join(" / ")}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <Panel title="実行ログ（AI Execution Log）">
        {!logs || logs.length === 0 ? (
          <Empty>実行ログなし — エージェント実行が始まるとここに記録されます</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2">
                <StatusDot status={l.status === "succeeded" ? "completed" : l.status === "failed" ? "danger" : l.status} />
                <span className="font-medium">
                  {(l as unknown as { ai_agents: { name: string } | null }).ai_agents?.name ?? "-"}
                </span>
                <span className="text-[--color-dim]">{l.task ?? "-"}</span>
                <Badge tone={l.status === "succeeded" ? "ok" : l.status === "failed" ? "danger" : "default"}>{l.status}</Badge>
                <span className="text-xs text-[--color-dim]">{fmtDate(l.started_at)}</span>
                {l.result_summary && <span className="w-full pl-4 text-xs text-[--color-dim]">{l.result_summary}</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function statusJa(s: string) {
  const map: Record<string, string> = {
    idle: "待機", working: "稼働中", waiting_approval: "承認待ち", error: "エラー", paused: "停止中",
  };
  return map[s] ?? s;
}
