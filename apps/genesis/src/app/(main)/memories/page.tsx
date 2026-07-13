import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, Field, inputCls, btnCls, fmtDate } from "@/components/ui";
import { createMemory } from "./actions";

export const dynamic = "force-dynamic";

const CATEGORIES = ["general", "decision", "customer", "staff", "store", "product", "playbook", "meeting"];

export default async function MemoriesPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const { data: memories } = await admin
    .from("business_memories")
    .select("*")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("importance")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Business Memory</h1>
        <p className="text-sm text-(--color-dim)">会社の記憶 — 判断理由・学び・勝ちパターンを残す</p>
      </header>

      <Panel title="記憶を追加">
        <form action={createMemory} className="grid gap-3 lg:grid-cols-3">
          <Field label="タイトル（必須）">
            <input name="title" className={inputCls} required />
          </Field>
          <Field label="カテゴリ">
            <select name="category" className={inputCls}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="重要度（1=高〜5=低）">
            <select name="importance" className={inputCls} defaultValue="3">
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Field>
          <div className="lg:col-span-3">
            <Field label="要約（必須）">
              <textarea name="summary" rows={2} className={inputCls} required />
            </Field>
          </div>
          <Field label="背景・文脈（任意）">
            <textarea name="context" rows={2} className={inputCls} />
          </Field>
          <Field label="学び（任意）">
            <textarea name="learnings" rows={2} className={inputCls} />
          </Field>
          <Field label="今後への推奨（任意）">
            <textarea name="future_recommendation" rows={2} className={inputCls} />
          </Field>
          <div>
            <button className={btnCls}>保存</button>
          </div>
        </form>
      </Panel>

      <Panel title="記憶一覧">
        {!memories || memories.length === 0 ? (
          <Empty>まだ記憶がありません</Empty>
        ) : (
          <ul className="space-y-3">
            {memories.map((m) => (
              <li key={m.id} className="rounded-lg border border-(--color-line) bg-(--color-panel-2) p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{m.title}</span>
                  <Badge tone="accent">{m.category}</Badge>
                  <Badge tone={m.importance <= 2 ? "gold" : "default"}>重要度{m.importance}</Badge>
                  {m.human_verified && <Badge tone="ok">検証済み</Badge>}
                  {m.ai_generated && <Badge>AI生成</Badge>}
                  <span className="text-xs text-(--color-dim)">{fmtDate(m.created_at)}</span>
                </div>
                <p className="mt-1 text-sm text-(--color-dim)">{m.summary}</p>
                {m.learnings && <p className="mt-1 text-xs text-emerald-300">学び: {m.learnings}</p>}
                {m.future_recommendation && (
                  <p className="mt-1 text-xs text-sky-300">推奨: {m.future_recommendation}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
