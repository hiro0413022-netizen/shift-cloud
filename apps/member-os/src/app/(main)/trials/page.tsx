import { requireReceptionActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { Badge, Empty, fmtDate } from "@/components/ui";
import { TRIAL_STATUS_LABEL, TRIAL_STATUS_TONE } from "@/lib/trial";
import { setTrialStatus, saveTrialNote } from "./actions";

export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;

export default async function TrialsPage() {
  const actor = await requireReceptionActor();
  const admin = createAdmin();
  const { data } = await admin
    .from("mbr_trial_requests")
    .select("*")
    .eq("company_id", actor.companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);

  const rows = (data ?? []) as Row[];
  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">体験申込 — FRANK GOLF 姫路</h1>
          <p className="mt-1 text-sm text-(--color-dim)">公式サイトの体験フォームからの申込です。未対応 {pending} 件。</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty>まだ体験申込はありません。公式サイトの体験フォーム（/trial）から届きます。</Empty>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const st = String(r.status);
            const id = String(r.id);
            return (
              <div key={id} className="rounded-2xl border border-(--color-line) bg-(--color-panel) p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-(--color-txt)">{String(r.name)}</span>
                      {r.name_kana ? <span className="text-xs text-(--color-dim)">{String(r.name_kana)}</span> : null}
                      <Badge tone={TRIAL_STATUS_TONE[st] ?? "default"}>{TRIAL_STATUS_LABEL[st] ?? st}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-(--color-dim)">
                      {[r.phone && `TEL ${String(r.phone)}`, r.email && String(r.email), r.experience && String(r.experience)]
                        .filter(Boolean)
                        .join("　")}
                    </div>
                  </div>
                  <div className="text-right text-xs text-(--color-dim)">
                    受付 {fmtDate(String(r.created_at))}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 rounded-xl border border-(--color-line) bg-(--color-panel-2) p-3 text-sm sm:grid-cols-3">
                  <div><span className="text-xs text-(--color-dim)">第1希望</span><div>{r.pref1 ? String(r.pref1) : "—"}</div></div>
                  <div><span className="text-xs text-(--color-dim)">第2希望</span><div>{r.pref2 ? String(r.pref2) : "—"}</div></div>
                  <div><span className="text-xs text-(--color-dim)">第3希望</span><div>{r.pref3 ? String(r.pref3) : "—"}</div></div>
                </div>

                {r.message ? (
                  <p className="mt-2 rounded-lg bg-(--color-panel-2) px-3 py-2 text-sm text-(--color-txt)">{String(r.message)}</p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {st !== "confirmed" && (
                    <StatusButton id={id} to="confirmed" label="日程確定" />
                  )}
                  {st !== "done" && <StatusButton id={id} to="done" label="来店済にする" />}
                  {st !== "canceled" && <StatusButton id={id} to="canceled" label="キャンセル" danger />}
                  {st !== "pending" && <StatusButton id={id} to="pending" label="未対応に戻す" ghost />}
                </div>

                <form action={saveTrialNote} className="mt-3 flex items-center gap-2">
                  <input type="hidden" name="id" value={id} />
                  <input
                    name="staff_note"
                    defaultValue={r.staff_note ? String(r.staff_note) : ""}
                    placeholder="スタッフメモ（対応状況など）"
                    className="flex-1 rounded-lg border border-(--color-line) bg-(--color-panel-2) px-3 py-2 text-sm text-(--color-txt) focus:border-accent focus:outline-none"
                  />
                  <button className="rounded-lg border border-(--color-line) px-3 py-2 text-xs text-(--color-dim) hover:text-(--color-txt)">保存</button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusButton({ id, to, label, danger, ghost }: { id: string; to: string; label: string; danger?: boolean; ghost?: boolean }) {
  const cls = danger
    ? "border border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
    : ghost
      ? "border border-(--color-line) text-(--color-dim) hover:text-(--color-txt)"
      : "bg-accent text-white hover:bg-accent/90";
  return (
    <form action={setTrialStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
      <button className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${cls}`}>{label}</button>
    </form>
  );
}
