import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getOpenSuggestions, SUGGESTION_KIND_LABELS } from "@/lib/suggestions";
import { Panel, Badge, Empty, btnCls, btnGhostCls, inputCls, fmtDate } from "@/components/ui";
import { refreshSuggestions, dismissSuggestion, approveSuggestionAndIssue } from "./actions";

export const dynamic = "force-dynamic";

const SEV_TONE = { high: "danger", medium: "warn", low: "default" } as const;
const SEV_LABEL = { high: "最優先", medium: "推奨", low: "余力があれば" } as const;

export default async function SuggestionsPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const [suggestions, staffRes, agentRes] = await Promise.all([
    getOpenSuggestions(actor.companyId, 30),
    admin.from("staff").select("id, name").eq("company_id", actor.companyId).eq("status", "active").is("deleted_at", null).order("name"),
    admin.from("ai_agents").select("id, name, code").eq("company_id", actor.companyId).is("deleted_at", null).order("code"),
  ]);
  const staff = staffRes.data ?? [];
  const agents = agentRes.data ?? [];

  const high = suggestions.filter((s) => s.severity === "high").length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">改善提案 — 今週やると効くこと</h1>
          <p className="text-sm text-(--color-dim)">
            実データから毎日自動生成。<strong className="text-sky-300">「指示を出す」を押すとそのまま実行指示になります</strong>（スタッフのやること／AI社員／外部送信の承認）。
          </p>
        </div>
        <form action={refreshSuggestions}>
          <button className={btnCls}>提案を作り直す</button>
        </form>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="提案（未対応）" value={suggestions.length} tone={suggestions.length ? "warn" : "ok"} />
        <Stat label="最優先" value={high} tone={high ? "danger" : "ok"} />
        <Stat label="生成" text="日次レポート時に自動" />
      </div>

      {suggestions.length === 0 ? (
        <Panel title="改善提案">
          <Empty>提案はありません（［提案を作り直す］で生成できます）</Empty>
        </Panel>
      ) : (
        <ul className="space-y-3">
          {suggestions.map((s) => (
            <li
              key={s.id}
              className={`rounded-xl border bg-(--color-panel) p-4 ${
                s.severity === "high" ? "border-red-700/50" : s.severity === "medium" ? "border-amber-700/40" : "border-(--color-line)"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={SEV_TONE[s.severity as keyof typeof SEV_TONE] ?? "default"}>
                  {SEV_LABEL[s.severity as keyof typeof SEV_LABEL] ?? s.severity}
                </Badge>
                <Badge tone="accent">{SUGGESTION_KIND_LABELS[s.kind] ?? s.kind}</Badge>
                {s.source === "claude" && <Badge tone="gold">AI発案</Badge>}
                <span className="ml-auto text-xs text-(--color-dim)">{fmtDate(s.created_at)}</span>
              </div>

              <h2 className="mt-2 text-base font-bold">{s.title}</h2>
              {s.body && <p className="mt-1 text-sm text-(--color-dim)">{s.body}</p>}

              {s.suggested_action && (
                <div className="mt-2 rounded-lg border border-sky-800/40 bg-(--color-panel-2) p-3 text-sm">
                  <p className="mb-1 text-xs text-sky-300">実行手順</p>
                  {s.suggested_action}
                </div>
              )}

              <div className="mt-2 flex flex-wrap gap-3 text-xs text-(--color-dim)">
                {s.impact && <span>効果: {s.impact}</span>}
                {s.effort && <span>手間: {s.effort}</span>}
              </div>

              {/* 提案 → 実行指示 */}
              <form action={approveSuggestionAndIssue} className="mt-3 flex flex-wrap items-end gap-2 border-t border-(--color-line) pt-3">
                <input type="hidden" name="id" value={s.id} />
                <div>
                  <label className="block text-xs text-(--color-dim)">宛先</label>
                  <select name="target_kind" className={inputCls} defaultValue="ai_agent">
                    <option value="staff">スタッフ</option>
                    <option value="ai_agent">AI社員</option>
                    <option value="external">外部送信（承認へ）</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-(--color-dim)">スタッフ</label>
                  <select name="staff_id" className={inputCls} defaultValue="">
                    <option value="">—</option>
                    {staff.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-(--color-dim)">AI社員</label>
                  <select name="agent_id" className={inputCls} defaultValue="">
                    <option value="">—</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-(--color-dim)">期限</label>
                  <input type="date" name="due_date" className={inputCls} />
                </div>
                <button className={btnCls}>指示を出す</button>
                <button className={btnGhostCls} formAction={dismissSuggestion}>
                  却下
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, text, tone }: { label: string; value?: number; text?: string; tone?: "ok" | "warn" | "danger" }) {
  const color =
    tone === "danger" ? "text-red-400" : tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : "text-(--color-txt)";
  return (
    <div className="rounded-lg border border-(--color-line) bg-(--color-panel) p-3">
      <p className="text-xs text-(--color-dim)">{label}</p>
      {text !== undefined ? (
        <p className={`mt-1 text-sm ${color}`}>{text}</p>
      ) : (
        <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      )}
    </div>
  );
}
