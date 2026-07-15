import Link from "next/link";
import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { getDirectives, getStepsFor, TARGET_LABELS, DIRECTIVE_STATUS_LABELS, STEP_STATUS_LABELS } from "@/lib/directives";
import { Panel, Badge, Empty, StatusDot, btnCls, btnGhostCls, inputCls, fmtDate } from "@/components/ui";
import { createDirective, setDirectiveStatus, setStepStatus } from "./actions";

export const dynamic = "force-dynamic";

export default async function DirectivesPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const [open, done, staffRes, agentRes, approvalRes] = await Promise.all([
    getDirectives(actor.companyId, { open: true }),
    getDirectives(actor.companyId, { open: false }),
    admin.from("staff").select("id, name").eq("company_id", actor.companyId).eq("status", "active").is("deleted_at", null).order("name"),
    admin.from("ai_agents").select("id, name, code, role").eq("company_id", actor.companyId).is("deleted_at", null).order("code"),
    admin.from("approval_requests").select("id").eq("company_id", actor.companyId).eq("status", "pending"),
  ]);
  const staff = staffRes.data ?? [];
  const agents = agentRes.data ?? [];
  const pendingApprovals = (approvalRes.data ?? []).length;

  // キャンペーン（工程つき）指示の工程を取得
  const stepMap = await getStepsFor(
    actor.companyId,
    [...open, ...done].filter((d) => d.target_kind === "campaign").map((d) => d.id)
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">実行指示センター</h1>
        <p className="text-sm text-(--color-dim)">
          Genesisから指示を出す唯一の入口。スタッフには「やることリスト」に届き、AI社員には指示書が渡り、外部送信は承認を経てから実行されます（VISION §7）。改善提案からは「工程（誰が・何を・どの順で）」に分けて配れます。
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="未完了の指示" value={open.length} tone={open.length ? "warn" : "ok"} />
        <Stat label="スタッフ宛" value={open.filter((d) => d.target_kind === "staff").length} />
        <Stat label="AI社員宛" value={open.filter((d) => d.target_kind === "ai_agent").length} />
        <Link href="/approvals" className="block">
          <Stat label="承認待ち（外部送信）" value={pendingApprovals} tone={pendingApprovals ? "warn" : "ok"} />
        </Link>
      </div>

      <Panel title="新しい指示を出す">
        <form action={createDirective} className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="block text-xs text-(--color-dim)">指示内容（何をするか）</label>
            <input name="title" required className={inputCls} placeholder="例: 体験レッスン誘導のLINE配信文を3案つくる" />
          </div>
          <div>
            <label className="block text-xs text-(--color-dim)">宛先</label>
            <select name="target_kind" required className={inputCls} defaultValue="staff">
              <option value="staff">スタッフ（やることリストに配信）</option>
              <option value="ai_agent">AI社員（指示書を渡す）</option>
              <option value="external">外部送信（承認してから実行）</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-(--color-dim)">優先度</label>
            <select name="priority" className={inputCls} defaultValue="normal">
              <option value="high">高</option>
              <option value="normal">通常</option>
              <option value="low">低</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-(--color-dim)">スタッフ（宛先＝スタッフの場合）</label>
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
            <label className="block text-xs text-(--color-dim)">AI社員（宛先＝AI社員の場合）</label>
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
          <div className="md:col-span-2">
            <label className="block text-xs text-(--color-dim)">補足（背景・手順）</label>
            <textarea name="body" rows={3} className={`${inputCls} font-normal`} />
          </div>
          <div className="md:col-span-2">
            <button className={btnCls}>指示を出す</button>
          </div>
        </form>
      </Panel>

      <Panel title={`未完了の指示（${open.length}件）`}>
        {open.length === 0 ? (
          <Empty>未完了の指示はありません</Empty>
        ) : (
          <ul className="space-y-3">
            {open.map((d) => {
              const steps = stepMap.get(d.id) ?? [];
              const doneCount = steps.filter((s) => s.status === "done" || s.status === "cancelled").length;
              return (
                <li key={d.id} className="rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={d.target_kind === "external" ? "gold" : d.target_kind === "campaign" ? "gold" : d.target_kind === "staff" ? "accent" : "ok"}>
                      {TARGET_LABELS[d.target_kind]}
                    </Badge>
                    {d.priority === "high" && <Badge tone="danger">高</Badge>}
                    <span className="text-sm font-medium">{d.title}</span>
                    <span className="text-xs text-(--color-dim)">
                      → {d.target_kind === "campaign" ? `${steps.length}工程` : d.staff_name ?? d.agent_name ?? (d.target_kind === "external" ? "承認待ち" : "—")}
                    </span>
                    {d.due_date && <span className="text-xs text-amber-300">期限 {d.due_date}</span>}
                    <span className="ml-auto text-xs text-(--color-dim)">
                      {DIRECTIVE_STATUS_LABELS[d.status] ?? d.status} / {fmtDate(d.created_at)}
                    </span>
                  </div>
                  {d.body && <p className="mt-1 whitespace-pre-wrap text-xs text-(--color-dim)">{d.body}</p>}
                  {d.origin_kind === "suggestion" && <p className="mt-1 text-xs text-sky-300">改善提案から発行</p>}

                  {steps.length === 0 ? (
                    <form action={setDirectiveStatus} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={d.id} />
                      <input name="result" placeholder="結果メモ（任意）" className={`${inputCls} max-w-xs`} />
                      <button name="status" value="done" className={btnCls}>
                        完了にする
                      </button>
                      <button name="status" value="in_progress" className={btnGhostCls}>
                        対応中
                      </button>
                      <button name="status" value="cancelled" className={btnGhostCls}>
                        取消
                      </button>
                    </form>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-(--color-dim)">
                        工程 {doneCount}/{steps.length} 完了
                      </p>
                      <ol className="space-y-2">
                        {steps.map((st) => (
                          <li key={st.id} className="rounded-lg border border-(--color-line) bg-(--color-panel) p-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusDot status={st.status} />
                              <span className="text-xs font-bold text-sky-300">#{st.seq}</span>
                              <Badge tone={st.target_kind === "staff" ? "accent" : "ok"}>
                                {st.target_kind === "staff" ? "スタッフ" : "AI社員"}
                              </Badge>
                              <span className="text-sm">{st.title}</span>
                              <span className="text-xs text-(--color-dim)">→ {st.staff_name ?? st.agent_name ?? "未割当"}</span>
                              {st.due_date && <span className="text-xs text-amber-300">期限 {st.due_date}</span>}
                              <span className="ml-auto text-xs text-(--color-dim)">{STEP_STATUS_LABELS[st.status] ?? st.status}</span>
                            </div>
                            {st.detail && <p className="mt-1 whitespace-pre-wrap text-xs text-(--color-dim)">{st.detail}</p>}
                            {st.status !== "done" && st.status !== "cancelled" && (
                              <form action={setStepStatus} className="mt-1.5 flex flex-wrap items-center gap-2">
                                <input type="hidden" name="step_id" value={st.id} />
                                <button name="status" value="done" className={btnCls}>
                                  完了
                                </button>
                                <button name="status" value="in_progress" className={btnGhostCls}>
                                  対応中
                                </button>
                                <button name="status" value="cancelled" className={btnGhostCls}>
                                  取消
                                </button>
                              </form>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="完了・取消（直近20件）">
        {done.length === 0 ? (
          <Empty>履歴なし</Empty>
        ) : (
          <ul className="space-y-2 text-sm">
            {done.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={d.status === "done" ? "ok" : "default"}>{DIRECTIVE_STATUS_LABELS[d.status] ?? d.status}</Badge>
                <span>{d.title}</span>
                <span className="text-xs text-(--color-dim)">{d.staff_name ?? d.agent_name ?? (d.target_kind === "campaign" ? "キャンペーン" : "")}</span>
                {d.result && <span className="text-xs text-(--color-dim)">／ {d.result}</span>}
                <span className="ml-auto text-xs text-(--color-dim)">{fmtDate(d.done_at ?? d.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "danger" }) {
  const color =
    tone === "danger" ? "text-red-400" : tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : "text-(--color-txt)";
  return (
    <div className="rounded-lg border border-(--color-line) bg-(--color-panel) p-3">
      <p className="text-xs text-(--color-dim)">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
