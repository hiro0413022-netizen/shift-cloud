import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, Field, inputCls, btnCls, fmtDate } from "@/components/ui";
import { createMemory, rememberMemory, confirmMemory, forgetMemory } from "./actions";

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
  // Genesis Memory（5スコープ・#299）
  const { data: gm } = await admin
    .from("gn_memories")
    .select("id, scope, scope_id, key, value, source, confidence, verified_at, expires_at, created_at")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("scope")
    .order("confidence", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(300);
  const genesisMemories = (gm ?? []) as Array<{ id: string; scope: string; scope_id: string | null; key: string; value: string; source: string | null; confidence: number; verified_at: string | null; expires_at: string | null; created_at: string }>;
  const { data: storeRows } = await admin.from("stores").select("id, name").eq("company_id", actor.companyId).is("deleted_at", null);
  const storeName = new Map(((storeRows ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]));
  const SCOPE_LABEL: Record<string, string> = { user: "本人", company: "会社", store: "店舗", customer: "お客様", project: "案件" };
  const unconfirmed = genesisMemories.filter((m) => Number(m.confidence) < 1).length;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">Business Memory</h1>
        <p className="text-sm text-(--color-dim)">会社の記憶 — 判断理由・学び・勝ちパターンを残す</p>
      </header>

      <Panel title={`Genesis の記憶（5スコープ・${genesisMemories.length} 件${unconfirmed ? `・未確認 ${unconfirmed}` : ""}）`}>
        <p className="mb-3 text-xs text-(--color-dim)">
          JARVIS が会話のたびに読む記憶。会社のルール・店舗の事情・本人の好み・お客様・案件の5つ。AI が推測したものは「推定」として入り、確認を押すと確定になる。
          JARVIS に「覚えておいて」と言っても増える。
        </p>
        <form action={rememberMemory} className="mb-3 grid gap-2 lg:grid-cols-[1fr_140px_200px_auto]">
          <input name="value" className={inputCls} placeholder="覚えておくこと（例: 提出物に「仮」を出さない）" required />
          <select name="scope" className={inputCls} defaultValue="company">
            {Object.entries(SCOPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input name="scope_id" className={inputCls} placeholder="店舗ID / 電話 / 案件ID（任意）" />
          <button className={btnCls}>覚える</button>
        </form>
        {genesisMemories.length === 0 ? (
          <Empty>まだ記憶がありません（migration 0213 の取り込み後に経営メモ・意思決定ログがここに入ります）</Empty>
        ) : (
          <ul className="divide-y divide-(--color-line) text-sm">
            {genesisMemories.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                <Badge tone={m.scope === "company" ? "accent" : "default"}>{SCOPE_LABEL[m.scope] ?? m.scope}{m.scope === "store" && m.scope_id ? `・${storeName.get(m.scope_id) ?? m.scope_id.slice(0, 8)}` : m.scope_id && m.scope !== "user" ? `・${m.scope_id}` : ""}</Badge>
                <span className="flex-1 min-w-[200px]">{m.value}</span>
                {Number(m.confidence) < 1 ? <Badge tone="gold">推定 {Math.round(Number(m.confidence) * 100)}%</Badge> : <Badge tone="ok">確認済み</Badge>}
                {m.source ? <span className="text-[11px] text-(--color-faint)">{m.source}</span> : null}
                {m.expires_at ? <span className="text-[11px] text-(--color-faint)">〜{fmtDate(m.expires_at)}</span> : null}
                {Number(m.confidence) < 1 ? (
                  <form action={confirmMemory}>
                    <input type="hidden" name="id" value={m.id} />
                    <button className="text-xs text-emerald-300 hover:underline">確認</button>
                  </form>
                ) : null}
                <form action={forgetMemory}>
                  <input type="hidden" name="id" value={m.id} />
                  <button className="text-xs text-(--color-dim) hover:text-red-300">忘れる</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="記憶を追加（経営メモ・従来）">
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

      <Panel title="経営メモ一覧（従来・0213 で Genesis の記憶にも取り込み済み）">
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
