import { requireActor, visibleStores } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { PageTitle, Card, Badge, Empty } from "@/components/ui";
import { fmtDateJP, todayJST } from "@/lib/util";
import { eachDate } from "@/lib/shift-scope";
import { decideTimeOff } from "./actions";

const STATUS: Record<string, { label: string; color: "amber" | "green" | "zinc" | "red" }> = {
  submitted: { label: "未処理", color: "amber" },
  approved: { label: "承認済み", color: "green" },
  rejected: { label: "却下", color: "red" },
  withdrawn: { label: "取り下げ", color: "zinc" },
};
const KIND: Record<string, string> = { day_off: "休み希望", vacation: "長期休暇", other: "その他" };

export default async function TimeOffPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const actor = await requireActor("create_shifts");
  const admin = createAdmin();
  const sp = await searchParams;
  const showAll = sp.all === "1";
  const today = todayJST();

  // 自店舗のみ（#128）。店舗未設定の申請はどの管理者にも見せる
  const stores = await visibleStores(actor);
  const storeIds = stores.map((s) => s.id);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));

  let q = admin.from("staff_time_off_requests")
    .select("id, staff_id, store_id, start_date, end_date, kind, reason, status, decision_note, created_at, staff(name)")
    .eq("company_id", actor.companyId).is("deleted_at", null)
    .order("start_date");
  if (!showAll) q = q.gte("end_date", today);
  const { data: rows } = await q;

  const visible = (rows ?? []).filter((r) => !r.store_id || storeIds.includes(r.store_id));
  const pending = visible.filter((r) => r.status === "submitted");
  const decided = visible.filter((r) => r.status !== "submitted");

  return (
    <>
      <PageTitle>休み希望</PageTitle>
      <p className="mb-4 -mt-4 text-sm text-zinc-500">
        スタッフは募集期間に関係なくいつでも出せます。承認するとその期間のシフトが自動で「休み」になります
        （確定済みのシフトは書き換えません）。
      </p>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold">未処理（{pending.length}件）</h2>
        {pending.length === 0 ? (
          <Empty>未処理の休み希望はありません</Empty>
        ) : (
          <div className="space-y-2">
            {pending.map((r) => (
              <Card key={r.id} className="!p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">
                      {(r.staff as unknown as { name: string } | null)?.name ?? "—"}
                      <span className="ml-2 text-sm font-normal text-zinc-500">
                        {r.store_id ? storeName.get(r.store_id) ?? "" : "店舗未設定"}
                      </span>
                    </p>
                    <p className="mt-1 text-sm">
                      {r.start_date === r.end_date
                        ? fmtDateJP(r.start_date)
                        : `${fmtDateJP(r.start_date)} 〜 ${fmtDateJP(r.end_date)}`}
                      <span className="ml-2 text-xs text-zinc-400">
                        {eachDate(r.start_date, r.end_date).length}日間
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {KIND[r.kind] ?? r.kind}{r.reason ? ` ・ ${r.reason}` : ""}
                    </p>
                  </div>
                  <form action={decideTimeOff} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      name="note"
                      placeholder="ひとこと（任意）"
                      className="w-44 rounded-md border border-zinc-300 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                    />
                    <button name="decision" value="approved"
                      className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
                      承認
                    </button>
                    <button name="decision" value="rejected"
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50">
                      却下
                    </button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center gap-3">
          <h2 className="text-sm font-semibold">処理済み</h2>
          <a href={showAll ? "/admin/time-off" : "/admin/time-off?all=1"}
            className="text-xs text-zinc-400 underline hover:text-zinc-600">
            {showAll ? "これから先の分だけ表示" : "過去の分も表示"}
          </a>
        </div>
        {decided.length === 0 ? (
          <Empty>まだありません</Empty>
        ) : (
          <div className="space-y-1.5">
            {decided.map((r) => {
              const st = STATUS[r.status] ?? { label: r.status, color: "zinc" as const };
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
                  <Badge color={st.color}>{st.label}</Badge>
                  <span className="font-medium">{(r.staff as unknown as { name: string } | null)?.name ?? "—"}</span>
                  <span className="text-zinc-500">
                    {r.start_date === r.end_date ? r.start_date : `${r.start_date}〜${r.end_date}`}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {KIND[r.kind] ?? r.kind}{r.reason ? ` ・ ${r.reason}` : ""}
                    {r.decision_note ? ` ／ ${r.decision_note}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
