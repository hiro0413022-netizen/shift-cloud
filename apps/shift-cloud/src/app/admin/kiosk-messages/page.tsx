import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { PageTitle, Card, Badge, Empty } from "@/components/ui";
import { timeJST, dateJST } from "@/lib/util";
import { resolveMessage } from "./actions";

export default async function KioskMessagesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const actor = await requireActor("edit_attendance");
  const admin = createAdmin();
  const sp = await searchParams;
  const showAll = sp.show === "all";

  let q = admin.from("kiosk_messages")
    .select("*, staff(name), stores(name)")
    .eq("company_id", actor.companyId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!showAll) q = q.eq("resolved", false);
  const { data: messages } = await q;

  return (
    <>
      <PageTitle>打刻端末メモ</PageTitle>
      <div className="mb-4 flex gap-1">
        <a href="/admin/kiosk-messages" className={`rounded-md px-3 py-1.5 text-sm ${!showAll ? "bg-brand-light font-medium text-brand" : "text-zinc-500 hover:bg-zinc-100"}`}>未対応</a>
        <a href="/admin/kiosk-messages?show=all" className={`rounded-md px-3 py-1.5 text-sm ${showAll ? "bg-brand-light font-medium text-brand" : "text-zinc-500 hover:bg-zinc-100"}`}>すべて</a>
      </div>

      {!messages?.length ? (
        <Empty>{showAll ? "メモはありません" : "未対応のメモはありません"}</Empty>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => {
            const staffName = (m.staff as unknown as { name: string } | null)?.name ?? "（名前未選択）";
            const storeName = (m.stores as unknown as { name: string } | null)?.name ?? "";
            return (
              <Card key={m.id} className={`!p-4 ${m.resolved ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge color={m.kind === "missing_clock" ? "amber" : "blue"}>
                        {m.kind === "missing_clock" ? "打刻忘れ" : "伝言"}
                      </Badge>
                      <span className="text-sm font-semibold">{staffName}</span>
                      <span className="text-xs text-zinc-400">{storeName}</span>
                      <span className="text-xs text-zinc-400">
                        {dateJST(m.created_at).slice(5)} {timeJST(m.created_at)}
                      </span>
                      {m.resolved && <Badge color="green">対応済み</Badge>}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-zinc-700">{m.body}</p>
                  </div>
                  <form action={resolveMessage} className="shrink-0">
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="resolved" value={m.resolved ? "false" : "true"} />
                    <button className={`rounded-md px-3 py-1.5 text-sm font-medium ${m.resolved ? "border border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-50" : "bg-brand text-white hover:opacity-90"}`}>
                      {m.resolved ? "未対応に戻す" : "対応済みにする"}
                    </button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
