import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, StatusDot, ProgressBar, Empty, Field, inputCls, btnCls, btnGhostCls, severityTone } from "@/components/ui";
import { updateDevStatus, createRisk, closeRisk, createBlocker, resolveBlocker } from "./actions";

export const dynamic = "force-dynamic";

const PHASES = ["design", "build", "test", "review", "approval", "deploy_ready", "live", "error"];
const STATUSES = ["active", "blocked", "done", "paused"];

export default async function DevPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const [{ data: statuses }, { data: risks }, { data: blockers }, { data: modules }] = await Promise.all([
    admin.from("development_statuses").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("progress"),
    admin.from("risks").select("*").eq("company_id", actor.companyId).is("deleted_at", null).eq("status", "open").order("severity"),
    admin.from("blockers").select("*").eq("company_id", actor.companyId).is("deleted_at", null).eq("status", "open"),
    admin.from("modules").select("*").eq("company_id", actor.companyId).is("deleted_at", null).order("sort_order"),
  ]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Development Map</h1>
        <p className="text-sm text-[--color-dim]">モジュール別の開発状況・リスク・ブロッカー</p>
      </header>

      {/* モジュールマップ */}
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
        {(modules ?? []).map((m) => (
          <div key={m.id} className="rounded-xl border border-[--color-line] bg-[--color-panel] p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                <StatusDot status={m.status} />
                {m.name}
              </span>
              <Badge tone={m.status === "live" ? "ok" : m.status === "building" ? "accent" : "default"}>
                {m.status}
              </Badge>
            </div>
            {m.description && <p className="mt-1 line-clamp-2 text-xs text-[--color-dim]">{m.description}</p>}
          </div>
        ))}
      </div>

      {/* 開発ステータス編集 */}
      <Panel title="開発ステータス">
        {!statuses || statuses.length === 0 ? (
          <Empty>登録なし</Empty>
        ) : (
          <ul className="space-y-4">
            {statuses.map((s) => (
              <li key={s.id} className="rounded-lg border border-[--color-line] bg-[--color-panel-2] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium">
                    <StatusDot status={s.status} />
                    {s.module_name}
                  </span>
                  <span className="text-sm text-[--color-dim]">{s.progress}%</span>
                </div>
                <ProgressBar value={s.progress} />
                {Array.isArray(s.completed_items) && s.completed_items.length > 0 && (
                  <p className="mt-2 text-xs text-emerald-300/80">完了: {(s.completed_items as string[]).join(" / ")}</p>
                )}
                {Array.isArray(s.remaining_items) && s.remaining_items.length > 0 && (
                  <p className="mt-1 text-xs text-[--color-dim]">残: {(s.remaining_items as string[]).join(" / ")}</p>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-[--color-dim]">更新する</summary>
                  <form action={updateDevStatus} className="mt-2 grid gap-2 lg:grid-cols-5">
                    <input type="hidden" name="id" value={s.id} />
                    <Field label="フェーズ">
                      <select name="phase" defaultValue={s.phase} className={inputCls}>
                        {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </Field>
                    <Field label="状態">
                      <select name="status" defaultValue={s.status} className={inputCls}>
                        {STATUSES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </Field>
                    <Field label="進捗%">
                      <input name="progress" type="number" min={0} max={100} defaultValue={s.progress} className={inputCls} />
                    </Field>
                    <Field label="現在の作業">
                      <input name="current_task" defaultValue={s.current_task ?? ""} className={inputCls} />
                    </Field>
                    <Field label="次アクション">
                      <input name="next_action" defaultValue={s.next_action ?? ""} className={inputCls} />
                    </Field>
                    <div className="lg:col-span-5">
                      <button className={btnGhostCls}>保存</button>
                    </div>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="リスク">
          <form action={createRisk} className="mb-3 grid grid-cols-4 items-end gap-2">
            <div className="col-span-2">
              <input name="title" className={inputCls} placeholder="リスクを追加" required />
            </div>
            <select name="severity" className={inputCls}>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="critical">critical</option>
            </select>
            <button className={btnCls}>追加</button>
            <div className="col-span-4">
              <input name="mitigation" className={inputCls} placeholder="対策（任意）" />
            </div>
          </form>
          {!risks || risks.length === 0 ? (
            <Empty>オープンリスクなし</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {risks.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span>
                    {r.title}
                    {r.mitigation && <span className="block text-xs text-[--color-dim]">対策: {r.mitigation}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge tone={severityTone(r.severity)}>{r.severity}</Badge>
                    <form action={closeRisk}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-xs text-[--color-dim] hover:text-emerald-300">対処済み</button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="ブロッカー">
          <form action={createBlocker} className="mb-3 grid grid-cols-4 items-end gap-2">
            <div className="col-span-3">
              <input name="title" className={inputCls} placeholder="ブロッカーを追加" required />
            </div>
            <button className={btnCls}>追加</button>
            <div className="col-span-2">
              <input name="blocking_what" className={inputCls} placeholder="何が止まるか（任意）" />
            </div>
            <div className="col-span-2">
              <input name="needs" className={inputCls} placeholder="解消条件（任意）" />
            </div>
          </form>
          {!blockers || blockers.length === 0 ? (
            <Empty>オープンブロッカーなし</Empty>
          ) : (
            <ul className="space-y-2 text-sm">
              {blockers.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2">
                  <span>
                    {b.title}
                    {b.needs && <span className="block text-xs text-[--color-dim]">解消条件: {b.needs}</span>}
                  </span>
                  <form action={resolveBlocker}>
                    <input type="hidden" name="id" value={b.id} />
                    <button className="shrink-0 text-xs text-[--color-dim] hover:text-emerald-300">解消</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
