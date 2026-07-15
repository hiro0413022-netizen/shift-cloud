import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, btnCls, btnGhostCls, fmtDate } from "@/components/ui";
import { reviewDeliverable } from "./actions";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  task: string | null;
  output: string | null;
  status: string;
  review_status: string | null;
  finished_at: string | null;
  tokens_used: number | null;
  cost_estimate_yen: number | null;
  error: string | null;
  ai_agents: { name: string } | null;
};

export default async function DeliverablesPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const { data } = await admin
    .from("ai_execution_logs")
    .select("id, task, output, status, review_status, finished_at, tokens_used, cost_estimate_yen, error, ai_agents(name)")
    .eq("company_id", actor.companyId)
    .not("review_status", "is", null)
    .is("deleted_at", null)
    .order("finished_at", { ascending: false })
    .limit(80);

  const rows = (data ?? []) as unknown as Row[];
  const pending = rows.filter((r) => r.review_status === "pending");
  const reviewed = rows.filter((r) => r.review_status !== "pending");

  return (
    <div className="space-y-4">
      <header className="reveal">
        <h1 className="text-xl font-bold">成果物レビュー（AI Deliverables）</h1>
        <p className="text-sm text-(--color-dim)">
          AI社員が指示書から作った成果物がここに溜まります。中身を確認して承認/却下を押すだけ。配信・課金は承認後に人が実行（VISION §7）
        </p>
      </header>

      <Panel title={`レビュー待ち（${pending.length}件）`}>
        {pending.length === 0 ? (
          <Empty>レビュー待ちの成果物はありません — 毎朝の日次実行で新しい成果物が生成されるとここに出ます</Empty>
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => (
              <li key={r.id} className="rounded-xl border border-(--color-line) bg-(--color-panel) p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <Badge tone="accent">{r.ai_agents?.name ?? "AI社員"}</Badge>
                    {r.task}
                  </span>
                  <span className="text-xs text-(--color-dim)">
                    {fmtDate(r.finished_at)}
                    {r.cost_estimate_yen != null ? ` ・約¥${r.cost_estimate_yen}` : ""}
                    {r.tokens_used != null ? ` ・${r.tokens_used}tok` : ""}
                  </span>
                </div>
                <div className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-lg border border-(--color-line)/60 bg-(--color-panel-2) p-3 text-sm leading-relaxed">
                  {r.output ?? "（本文なし）"}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <form action={reviewDeliverable}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="approved" />
                    <button className={btnCls}>承認</button>
                  </form>
                  <form action={reviewDeliverable}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="decision" value="rejected" />
                    <button className={btnGhostCls}>却下</button>
                  </form>
                  <span className="text-xs text-(--color-dim)">承認しても自動配信はしません（下書きとして確定）</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="レビュー済み">
        {reviewed.length === 0 ? (
          <Empty>まだ承認/却下した成果物はありません</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {reviewed.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 border-b border-(--color-line)/40 pb-2">
                <Badge tone={r.review_status === "approved" ? "ok" : "danger"}>
                  {r.review_status === "approved" ? "承認" : "却下"}
                </Badge>
                <span className="font-medium">{r.ai_agents?.name ?? "AI社員"}</span>
                <span className="text-(--color-dim)">{r.task}</span>
                <span className="ml-auto text-xs text-(--color-dim)">{fmtDate(r.finished_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
