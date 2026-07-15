import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getOpenSuggestions, SUGGESTION_KIND_LABELS } from "@/lib/suggestions";
import { Panel, Empty, btnCls } from "@/components/ui";
import { refreshSuggestions } from "./actions";
import { SuggestionCard } from "./suggestion-card";

export const dynamic = "force-dynamic";

const SEV_TONE = { critical: "danger", warning: "warn", info: "default" } as const;
const SEV_LABEL = { critical: "最優先", warning: "推奨", info: "余力があれば" } as const;

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

  const high = suggestions.filter((s) => s.severity === "critical").length;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">改善提案 — 今週やると効くこと</h1>
          <p className="text-sm text-(--color-dim)">
            実データから毎日自動生成。<strong className="text-sky-300">文面を直し、工程（誰が・何を・どの順で）に分けて指示を出すと、スタッフのやることリストとAI社員に配られます</strong>。「AIに工程を下書きさせる」で担当割り当てまで自動作成できます。
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
            <SuggestionCard
              key={s.id}
              s={{
                id: s.id,
                kind: s.kind,
                kindLabel: SUGGESTION_KIND_LABELS[s.kind] ?? s.kind,
                severity: s.severity,
                sevLabel: SEV_LABEL[s.severity as keyof typeof SEV_LABEL] ?? s.severity,
                sevTone: SEV_TONE[s.severity as keyof typeof SEV_TONE] ?? "default",
                title: s.title,
                body: s.body,
                suggested_action: s.suggested_action,
                impact: s.impact,
                effort: s.effort,
                source: s.source,
                created_at: s.created_at,
              }}
              staff={staff}
              agents={agents}
            />
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
