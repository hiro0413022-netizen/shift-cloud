import { requireGenesisActor } from "@/lib/auth";
import { getCockpitData } from "@/lib/kernel";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, StatusDot, Empty, Field, inputCls, btnCls, severityTone, fmtDate } from "@/components/ui";
import { generatePrompt, generateDailyReport } from "./actions";

export const dynamic = "force-dynamic";

export default async function CommandPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const [d, promptsRes, reportsRes] = await Promise.all([
    getCockpitData(actor.companyId),
    admin.from("prompts").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
    admin.from("reports").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1),
  ]);
  const prompts = promptsRes.data ?? [];
  const latestReport = (reportsRes.data ?? [])[0];

  const nextActions = d.devStatuses.filter((s) => s.next_action);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">CEO AI Command Center</h1>
          <p className="text-sm text-[--color-dim]">「今どうなってる？」に答える管制塔</p>
        </div>
        <form action={generateDailyReport}>
          <button className={btnCls}>日次レポート生成</button>
        </form>
      </header>

      {/* サマリ行 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="開発中" value={`${d.devStatuses.filter((s) => s.status === "active").length}件`} />
        <Stat label="ブロッカー" value={`${d.blockers.length}件`} tone={d.blockers.length ? "danger" : "ok"} />
        <Stat label="オープンリスク" value={`${d.risks.length}件`} tone={d.risks.length ? "warn" : "ok"} />
        <Stat label="承認待ち" value={`${d.approvals.length}件`} tone={d.approvals.length ? "warn" : "ok"} />
        <Stat label="AIエージェント" value={`${d.agents.length}体`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 今どうなってる？ */}
        <Panel title="開発状況">
          <ul className="space-y-3 text-sm">
            {d.devStatuses.map((s) => (
              <li key={String(s.id)}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium">
                    <StatusDot status={String(s.status)} />
                    {String(s.module_name)}
                    <Badge>{String(s.phase)}</Badge>
                  </span>
                  <span className="text-xs text-[--color-dim]">{Number(s.progress)}%</span>
                </div>
                {Array.isArray(s.remaining_items) && (s.remaining_items as string[]).length > 0 && (
                  <p className="mt-1 text-xs text-[--color-dim]">残: {(s.remaining_items as string[]).join(" / ")}</p>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="今日やるべきこと / 判断待ち">
          {nextActions.length === 0 && d.approvals.length === 0 ? (
            <Empty>アクションなし</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {nextActions.map((s) => (
                <li key={String(s.id)} className="flex items-start gap-2">
                  <span className="text-sky-400">▸</span>
                  <span>
                    <span className="text-[--color-dim]">{String(s.module_name)}: </span>
                    {String(s.next_action)}
                  </span>
                </li>
              ))}
              {d.approvals.map((a) => (
                <li key={String(a.id)} className="flex items-start gap-2">
                  <span className="text-purple-400">✓</span>
                  <span>承認判断: {String(a.kind ?? "承認リクエスト")}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* リスク */}
        <Panel title="リスク / ブロッカー">
          {d.risks.length === 0 && d.blockers.length === 0 ? (
            <Empty>オープンなし</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {d.risks.map((r) => (
                <li key={String(r.id)}>
                  <div className="flex items-center justify-between gap-2">
                    <span>{String(r.title)}</span>
                    <Badge tone={severityTone(String(r.severity))}>{String(r.severity)}</Badge>
                  </div>
                  {r.mitigation != null && <p className="text-xs text-[--color-dim]">対策: {String(r.mitigation)}</p>}
                </li>
              ))}
              {d.blockers.map((b) => (
                <li key={String(b.id)}>
                  <div className="flex items-center justify-between gap-2">
                    <span>{String(b.title)}</span>
                    <Badge tone="danger">blocker</Badge>
                  </div>
                  {b.needs != null && <p className="text-xs text-[--color-dim]">解消条件: {String(b.needs)}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* AI指示生成 */}
        <Panel title="AI指示プロンプト生成（Fable5 / Claude / Codexへ貼るだけ）">
          <form action={generatePrompt} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="対象AI">
                <select name="target_ai" className={inputCls}>
                  <option value="claude">Claude</option>
                  <option value="fable5">Fable5</option>
                  <option value="codex">Codex</option>
                </select>
              </Field>
              <Field label="対象モジュール">
                <select name="module_id" className={inputCls}>
                  <option value="">指定なし</option>
                  {d.modules.map((m) => (
                    <option key={String(m.id)} value={String(m.id)}>
                      {String(m.name)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="目的（必須）">
              <input name="goal" className={inputCls} placeholder="例: パスワードリセット画面を実装する" required />
            </Field>
            <Field label="変更対象（任意）">
              <input name="targets" className={inputCls} placeholder="例: apps/shift-cloud/src/app/reset-password/*" />
            </Field>
            <Field label="実装内容（任意）">
              <textarea name="details" rows={2} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="注意点（任意）">
                <input name="cautions" className={inputCls} />
              </Field>
              <Field label="完了条件（任意）">
                <input name="done_criteria" className={inputCls} />
              </Field>
            </div>
            <button className={btnCls}>プロンプト生成</button>
          </form>
        </Panel>
      </div>

      {/* 生成済みプロンプト */}
      <Panel title="生成済みプロンプト（コピーして各AIへ）">
        {prompts.length === 0 ? (
          <Empty>まだ生成されていません</Empty>
        ) : (
          <ul className="space-y-2">
            {prompts.map((p) => (
              <li key={String(p.id)}>
                <details className="rounded-lg border border-[--color-line] bg-[--color-panel-2] p-3">
                  <summary className="cursor-pointer text-sm">
                    <Badge tone="accent">{String(p.target_ai)}</Badge>{" "}
                    <span className="ml-1">{String(p.title)}</span>
                    <span className="ml-2 text-xs text-[--color-dim]">{fmtDate(String(p.created_at))}</span>
                  </summary>
                  <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-3 text-xs leading-relaxed">
                    {String(p.body)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* 最新レポート */}
      {latestReport && (
        <Panel title={`最新レポート: ${String(latestReport.title)}`}>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-3 text-xs leading-relaxed">
            {String(latestReport.body)}
          </pre>
        </Panel>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "ok" | "warn" | "danger" }) {
  const color =
    tone === "danger" ? "text-red-300" : tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : "text-[--color-txt]";
  return (
    <div className="rounded-xl border border-[--color-line] bg-[--color-panel] p-3">
      <p className="text-xs text-[--color-dim]">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}
