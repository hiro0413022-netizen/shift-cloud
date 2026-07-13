import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, Field, inputCls, btnCls, btnGhostCls, fmtDate } from "@/components/ui";
import { createDecision, updateOutcome } from "./actions";

export const dynamic = "force-dynamic";

export default async function DecisionsPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const { data: decisions } = await admin
    .from("decision_logs")
    .select("*")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("decided_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Decision Log</h1>
        <p className="text-sm text-(--color-dim)">意思決定の記録 — 何を・なぜ・結果どうだったか</p>
      </header>

      <Panel title="意思決定を記録">
        <form action={createDecision} className="grid gap-3 lg:grid-cols-2">
          <Field label="決定内容（必須）">
            <input name="title" className={inputCls} required />
          </Field>
          <Field label="種別">
            <select name="decision_type" className={inputCls}>
              <option value="business">business</option>
              <option value="development">development</option>
              <option value="hr">hr</option>
              <option value="finance">finance</option>
              <option value="product">product</option>
            </select>
          </Field>
          <Field label="背景（任意）">
            <textarea name="context" rows={2} className={inputCls} />
          </Field>
          <Field label="検討した選択肢（任意）">
            <textarea name="options_considered" rows={2} className={inputCls} />
          </Field>
          <Field label="選んだ選択肢（任意）">
            <input name="selected_option" className={inputCls} />
          </Field>
          <Field label="理由（任意）">
            <input name="reason" className={inputCls} />
          </Field>
          <Field label="期待する結果（任意）">
            <input name="expected_result" className={inputCls} />
          </Field>
          <div className="flex items-end">
            <button className={btnCls}>記録</button>
          </div>
        </form>
      </Panel>

      <Panel title="決定一覧">
        {!decisions || decisions.length === 0 ? (
          <Empty>まだ決定がありません</Empty>
        ) : (
          <ul className="space-y-3">
            {decisions.map((d) => (
              <li key={d.id} className="rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{d.title}</span>
                  <Badge>{d.decision_type}</Badge>
                  <Badge tone={d.outcome === "success" ? "ok" : d.outcome === "failure" ? "danger" : "warn"}>
                    {d.outcome}
                  </Badge>
                  <span className="text-xs text-(--color-dim)">{fmtDate(d.decided_at)}</span>
                </div>
                {d.reason && <p className="mt-1 text-xs text-(--color-dim)">理由: {d.reason}</p>}
                {d.actual_result && <p className="mt-1 text-xs text-emerald-300">結果: {d.actual_result}</p>}
                {d.outcome === "pending" && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-(--color-dim)">結果を記録する</summary>
                    <form action={updateOutcome} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={d.id} />
                      <select name="outcome" className={`${inputCls} w-32`}>
                        <option value="success">success</option>
                        <option value="failure">failure</option>
                        <option value="mixed">mixed</option>
                      </select>
                      <input name="actual_result" className={`${inputCls} flex-1`} placeholder="実際の結果" />
                      <button className={btnGhostCls}>保存</button>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
