import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Panel, Badge, Empty, inputCls, btnCls } from "@/components/ui";
import { markFollowUp, undoFollowUp } from "./actions";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

const FOLLOW_DUE_DAYS = 7; // 体験から約1週間でフォロー

function daysSince(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
function md(s: unknown): string {
  const m = String(s ?? "").match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : String(s ?? "");
}
function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default async function FollowPage() {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);

  const { data } = await admin
    .from("mbr_walkin_visits")
    .select("id, visited_on, result, survey, follow_up_at, follow_up_note, mbr_guests(name, phone, email)")
    .eq("company_id", actor.companyId)
    .eq("visit_type", "trial")
    .is("deleted_at", null)
    .gte("visited_on", since)
    .order("visited_on", { ascending: true });

  const trials = (data ?? []) as Row[];
  const guestOf = (v: Row) => (v.mbr_guests ?? null) as { name?: string; phone?: string; email?: string } | null;
  const reasonOf = (v: Row) => {
    const s = v.survey as { trial_reason?: string; trial_reasons?: string[] } | null;
    if (!s) return null;
    if (s.trial_reason) return s.trial_reason;
    if (Array.isArray(s.trial_reasons) && s.trial_reasons.length) return s.trial_reasons.join("・");
    return null;
  };

  const todo = trials.filter((v) => v.result !== "join" && !v.follow_up_at);
  const joined = trials.filter((v) => v.result === "join");
  const done = trials
    .filter((v) => v.follow_up_at && String(v.follow_up_at) >= monthStart())
    .sort((a, b) => (String(a.follow_up_at) < String(b.follow_up_at) ? 1 : -1));

  const dueNow = todo.filter((v) => daysSince(String(v.visited_on)) >= FOLLOW_DUE_DAYS);
  const upcoming = todo.filter((v) => daysSince(String(v.visited_on)) < FOLLOW_DUE_DAYS);

  return (
    <div className="space-y-5">
      <header className="reveal">
        <h1 className="text-2xl font-bold tracking-tight">体験後フォロー</h1>
        <p className="mt-0.5 text-sm text-[--color-dim]">体験から約1週間後の公式LINE等フォローを管理（直近60日・未入会が対象）</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MiniStat label="要フォロー（7日以上経過）" value={dueNow.length} tone="text-rose-600" />
        <MiniStat label="フォロー予定（7日未満）" value={upcoming.length} tone="text-amber-600" />
        <MiniStat label="当月フォロー済" value={done.length} tone="text-emerald-600" />
      </div>

      <Panel title={`要フォロー（${todo.length}件）`} className="d1">
        {todo.length === 0 ? (
          <Empty>フォロー対象はありません 🎉</Empty>
        ) : (
          <div className="space-y-2">
            {[...dueNow, ...upcoming].map((v) => {
              const g = guestOf(v);
              const days = daysSince(String(v.visited_on));
              const due = days >= FOLLOW_DUE_DAYS;
              const reason = reasonOf(v);
              return (
                <div key={String(v.id)} className="rounded-xl border border-[--color-line] bg-[--color-panel-2] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={due ? "danger" : "warn"}>{days}日経過</Badge>
                      <span className="font-semibold">{g?.name ? String(g.name) : "（氏名未入力）"}</span>
                      {g?.phone ? <span className="text-xs text-[--color-dim]">{String(g.phone)}</span> : null}
                      <span className="text-xs text-[--color-dim]">体験 {md(v.visited_on)}</span>
                      {reason ? <span className="text-xs text-[--color-dim]">目的: {reason}</span> : null}
                    </div>
                  </div>
                  <form action={markFollowUp} className="mt-2 flex flex-wrap items-center gap-2 border-t border-[--color-line] pt-2">
                    <input type="hidden" name="id" value={String(v.id)} />
                    <input name="note" placeholder="フォロー内容（例: 公式LINEで再来案内・入会検討中 など）" className={`${inputCls} !py-1.5 flex-1`} />
                    <button className={btnCls}>公式LINEフォロー済にする</button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title={`当月フォロー済（${done.length}件）`} className="d2">
        {done.length === 0 ? (
          <Empty>今月のフォロー実績はまだありません</Empty>
        ) : (
          <div className="space-y-1.5">
            {done.map((v) => {
              const g = guestOf(v);
              return (
                <div key={String(v.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[--color-line] bg-[--color-panel-2] px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="ok">済</Badge>
                    <span className="font-semibold">{g?.name ? String(g.name) : "（氏名未入力）"}</span>
                    <span className="text-xs text-[--color-dim]">体験 {md(v.visited_on)}</span>
                    <span className="text-xs text-[--color-dim]">フォロー {md(v.follow_up_at)}</span>
                    {v.follow_up_note ? <span className="text-xs text-[--color-dim]">「{String(v.follow_up_note)}」</span> : null}
                  </div>
                  <form action={undoFollowUp}>
                    <input type="hidden" name="id" value={String(v.id)} />
                    <button className="text-xs text-[--color-dim] hover:text-[--color-txt]">取消</button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <p className="text-xs text-[--color-dim]">※ 体験後に入会された方（{joined.length}名・直近60日）は対象から自動で除外されます。</p>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="hud reveal rounded-2xl border border-[--color-line] bg-[--color-panel] p-5">
      <p className="text-sm font-medium text-[--color-dim]">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
