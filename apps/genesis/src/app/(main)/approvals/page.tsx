import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, btnCls, btnGhostCls, fmtDate } from "@/components/ui";
import { decideApproval } from "./actions";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const [{ data: pending }, { data: decided }] = await Promise.all([
    admin.from("approval_requests").select("*").eq("company_id", actor.companyId).eq("status", "pending").order("created_at", { ascending: false }),
    admin.from("approval_requests").select("*").eq("company_id", actor.companyId).neq("status", "pending").order("decided_at", { ascending: false }).limit(20),
  ]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Approvals</h1>
        <p className="text-sm text-[--color-dim]">人間の判断が必要な操作（Human Approval）</p>
      </header>

      <Panel title={`承認待ち（${pending?.length ?? 0}件）`}>
        {!pending || pending.length === 0 ? (
          <Empty>承認待ちはありません</Empty>
        ) : (
          <ul className="space-y-3">
            {pending.map((a) => (
              <li key={a.id} className="rounded-lg border border-purple-700/40 bg-[--color-panel-2] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">{a.kind}</Badge>
                  {a.target_table && (
                    <span className="text-xs text-[--color-dim]">
                      対象: {a.target_table}
                    </span>
                  )}
                  <span className="text-xs text-[--color-dim]">{fmtDate(a.created_at)}</span>
                </div>
                {a.payload != null && (
                  <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/40 p-2 text-xs">
                    {JSON.stringify(a.payload, null, 2)}
                  </pre>
                )}
                <div className="mt-3 flex gap-2">
                  <form action={decideApproval}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="decision" value="approved" />
                    <button className={btnCls}>承認</button>
                  </form>
                  <form action={decideApproval}>
                    <input type="hidden" name="id" value={a.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <button className={btnGhostCls}>却下</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="処理済み（直近20件）">
        {!decided || decided.length === 0 ? (
          <Empty>履歴なし</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {decided.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={a.status === "approved" ? "ok" : "danger"}>{a.status}</Badge>
                <span>{a.kind}</span>
                <span className="text-xs text-[--color-dim]">{fmtDate(a.decided_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
