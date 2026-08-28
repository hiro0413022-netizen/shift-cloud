import { requireGenesisActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, fmtDate } from "@/components/ui";
import { setDevRequestStatus } from "./actions";

export const dynamic = "force-dynamic";

/**
 * 開発依頼キュー（migration 0133 / DECISIONS #182）
 *
 * ホームのJARVISに「◯◯を直して」と話しかけると、AIが正式な指示書に起こしてここへ積む。
 * Cowork側のClaude（このリポジトリを触れる側）が queued を拾って実装し、
 * 着手で in_progress、実装が終わったら done + result_note を書き戻す。
 *
 * 本番へ出す最後の一歩（git push）はユーザーのPCからしか実行できない（2026-08-17の決定）。
 * その制約がそのまま最後の安全弁になっているので、依頼の起票と実装はAIに任せきってよい。
 */
export default async function DevRequestsPage() {
  const actor = await requireGenesisActor();
  const admin = createAdmin();
  const { data } = await admin
    .from("gn_dev_requests")
    .select("*")
    .eq("company_id", actor.companyId)
    .order("created_at", { ascending: false })
    .limit(60);
  const rows = data ?? [];

  const open = rows.filter((r) => r.status === "queued" || r.status === "in_progress" || r.status === "blocked");
  const closed = rows.filter((r) => !open.includes(r));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">開発依頼</h1>
        <p className="text-sm text-(--color-dim)">
          ホームでJARVISに話した「作ってほしい・直してほしい」がここに積まれます。指示書に起こしたうえで、開発側のAIが拾います。
        </p>
      </header>

      <Panel title={`着手待ち・作業中（${open.length}件）`}>
        {open.length === 0 ? <Empty>いま抱えている依頼はありません</Empty> : <List rows={open} />}
      </Panel>

      <Panel title="完了・却下">
        {closed.length === 0 ? <Empty>まだありません</Empty> : <List rows={closed} />}
      </Panel>
    </div>
  );
}

function List({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={String(r.id)} className="rounded-xl border border-(--color-line) bg-(--color-panel-2) px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(String(r.status))}>{statusJa(String(r.status))}</Badge>
            {String(r.priority) === "urgent" && <Badge tone="danger">至急</Badge>}
            {r.app_hint != null && <Badge>{String(r.app_hint)}</Badge>}
            <span className="min-w-0 flex-1 text-sm">{String(r.title)}</span>
            <span className="text-xs text-(--color-dim)">{fmtDate(String(r.created_at))}</span>
          </div>

          {r.said != null && <p className="mt-1 text-xs text-(--color-dim)">言われたこと: {String(r.said)}</p>}

          <details className="mt-2 rounded-lg border border-(--color-line) bg-(--color-panel) px-3 py-2">
            <summary className="cursor-pointer text-xs text-sky-300">開発指示書を見る</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed">{String(r.spec ?? "")}</pre>
          </details>

          {r.result_note != null && (
            <p className="mt-2 rounded-lg border border-emerald-800/40 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-100">
              {String(r.result_note)}
            </p>
          )}
          {r.blocked_reason != null && (
            <p className="mt-2 text-xs text-amber-300">止まっている理由: {String(r.blocked_reason)}</p>
          )}

          <div className="mt-2 flex gap-2">
            {String(r.status) !== "rejected" && (
              <form action={setDevRequestStatus}>
                <input type="hidden" name="id" value={String(r.id)} />
                <input type="hidden" name="status" value="rejected" />
                <button className="btn-sub">取り下げる</button>
              </form>
            )}
            {(String(r.status) === "rejected" || String(r.status) === "done") && (
              <form action={setDevRequestStatus}>
                <input type="hidden" name="id" value={String(r.id)} />
                <input type="hidden" name="status" value="queued" />
                <button className="btn-sub">キューに戻す</button>
              </form>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function statusJa(s: string) {
  const map: Record<string, string> = {
    queued: "着手待ち", in_progress: "作業中", done: "完了", rejected: "取り下げ", blocked: "保留",
  };
  return map[s] ?? s;
}

function statusTone(s: string): "default" | "ok" | "warn" | "danger" | "accent" {
  if (s === "done") return "ok";
  if (s === "in_progress") return "accent";
  if (s === "blocked") return "warn";
  if (s === "rejected") return "default";
  return "warn";
}
