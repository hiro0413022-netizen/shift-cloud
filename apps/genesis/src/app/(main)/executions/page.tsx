import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { listActions, type QueueRow } from "@/lib/ai-execution";
import { enqueueTestAction, cancelActionForm, approveActionForm, rejectActionForm, runNow } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<QueueRow["status"], { text: string; cls: string }> = {
  queued: { text: "待機", cls: "text-(--color-warn) border-(--color-warn)" },
  running: { text: "実行中", cls: "text-(--color-accent) border-(--color-accent)" },
  done: { text: "完了", cls: "text-(--color-ok) border-(--color-ok)" },
  cancelled: { text: "取消", cls: "text-(--color-dim) border-(--color-line)" },
  failed: { text: "失敗", cls: "text-(--color-danger) border-(--color-danger)" },
  awaiting_approval: { text: "承認待ち", cls: "text-(--color-gold) border-(--color-gold)" },
};

const MODE_LABEL: Record<string, string> = {
  auto: "自動",
  auto_undo: "自動(取消枠)",
  approval: "承認必須",
};

function fmt(ts: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function ExecutionsPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const [rows, { data: policies }] = await Promise.all([
    listActions(admin, actor.companyId, 60),
    admin
      .from("ai_execution_policies")
      .select("action_type, mode, undo_minutes, note")
      .eq("company_id", actor.companyId)
      .order("mode", { ascending: true })
      .order("action_type", { ascending: true }),
  ]);

  const now = Date.now();
  const counts = {
    auto: (policies ?? []).filter((p) => p.mode === "auto").length,
    auto_undo: (policies ?? []).filter((p) => p.mode === "auto_undo").length,
    approval: (policies ?? []).filter((p) => p.mode === "approval").length,
  };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">AI自動実行（executor）</h1>
      <p className="mb-4 text-sm text-(--color-dim)">
        AIのアクションはリスク階層（#61）で <b>自動</b> / <b>自動+取消枠</b> / <b>承認必須</b> に振り分けられ、ここで実行・記録されます。
        危険な操作（本番デプロイ・課金・顧客連絡・個人情報など）は承認必須のまま止まります。
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <form action={enqueueTestAction}>
          <button className="rounded-md border border-(--color-line) px-3 py-1.5 text-sm hover:bg-(--color-panel)">
            テスト実行を入れる（無害・2分後）
          </button>
        </form>
        <form action={runNow}>
          <button className="rounded-md border border-(--color-line) px-3 py-1.5 text-sm hover:bg-(--color-panel)">
            今すぐキューを回す
          </button>
        </form>
        <span className="text-xs text-(--color-dim)">
          ポリシー: 自動 {counts.auto} / 取消枠 {counts.auto_undo} / 承認必須 {counts.approval}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-(--color-line) p-6 text-center text-sm text-(--color-dim)">
          まだ実行はありません。「テスト実行を入れる」で動作を確認できます。
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-(--color-line)">
          <table className="w-full text-sm">
            <thead className="bg-(--color-panel) text-left text-xs text-(--color-dim)">
              <tr>
                <th className="px-3 py-2 font-medium">状態</th>
                <th className="px-3 py-2 font-medium">アクション</th>
                <th className="px-3 py-2 font-medium">モード</th>
                <th className="px-3 py-2 font-medium">予定 / 実行</th>
                <th className="px-3 py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = STATUS_LABEL[r.status];
                const withinUndo =
                  r.status === "queued" && r.mode === "auto_undo" && new Date(r.scheduled_at).getTime() > now;
                const minsLeft = withinUndo
                  ? Math.max(0, Math.ceil((new Date(r.scheduled_at).getTime() - now) / 60000))
                  : 0;
                return (
                  <tr key={r.id} className="border-t border-(--color-line) align-top">
                    <td className="px-3 py-2">
                      <span className={`inline-block rounded border px-1.5 py-0.5 text-xs ${s.cls}`}>{s.text}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.title}</div>
                      <div className="text-xs text-(--color-dim)">{r.action_type}</div>
                      {r.error && <div className="mt-1 text-xs text-(--color-danger)">{r.error}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs text-(--color-dim)">{MODE_LABEL[r.mode] ?? r.mode}</td>
                    <td className="px-3 py-2 text-xs text-(--color-dim)">
                      {r.executed_at ? `実行 ${fmt(r.executed_at)}` : fmt(r.scheduled_at)}
                      {withinUndo && <div className="text-(--color-warn)">あと約{minsLeft}分で自動実行</div>}
                    </td>
                    <td className="px-3 py-2">
                      {withinUndo && (
                        <form action={cancelActionForm}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="rounded border border-(--color-line) px-2 py-1 text-xs hover:bg-(--color-panel)">
                            取消
                          </button>
                        </form>
                      )}
                      {r.status === "awaiting_approval" && (
                        <div className="flex gap-1">
                          <form action={approveActionForm}>
                            <input type="hidden" name="id" value={r.id} />
                            <button className="rounded border border-(--color-ok) px-2 py-1 text-xs text-(--color-ok) hover:bg-(--color-panel)">
                              承認
                            </button>
                          </form>
                          <form action={rejectActionForm}>
                            <input type="hidden" name="id" value={r.id} />
                            <button className="rounded border border-(--color-line) px-2 py-1 text-xs text-(--color-dim) hover:bg-(--color-panel)">
                              却下
                            </button>
                          </form>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
