import { requireActor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { Card, Empty, Badge } from "@/components/ui";
import { todayJST } from "@/lib/util";

export default async function NoticesPage() {
  const actor = await requireActor();
  const supabase = await createClient();
  const today = todayJST();

  const [{ data: notifications }, { data: announcements }] = await Promise.all([
    supabase.from("notifications").select("*")
      .eq("staff_id", actor.staffId).order("created_at", { ascending: false }).limit(30),
    supabase.from("announcements").select("*")
      .is("deleted_at", null)
      .or(`publish_from.is.null,publish_from.lte.${today}`)
      .or(`publish_to.is.null,publish_to.gte.${today}`)
      .order("created_at", { ascending: false }).limit(20),
  ]);

  async function markAllRead() {
    "use server";
    const a = await requireActor();
    const admin = createAdmin();
    await admin.from("notifications").update({ read_at: new Date().toISOString() })
      .eq("staff_id", a.staffId).is("read_at", null);
    revalidatePath("/notices");
  }

  const unread = (notifications ?? []).filter((n) => !n.read_at).length;

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-500">通知 {unread > 0 && <Badge color="red">{unread}</Badge>}</h2>
          {unread > 0 && (
            <form action={markAllRead}>
              <button className="text-xs text-brand">すべて既読にする</button>
            </form>
          )}
        </div>
        {!notifications?.length ? (
          <Empty>通知はありません</Empty>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <Card key={n.id} className={`!p-3 ${!n.read_at ? "border-brand/40" : ""}`}>
                <p className="text-sm font-medium">{n.title}</p>
                {n.body && <p className="mt-0.5 text-xs text-zinc-500">{n.body}</p>}
                <p className="mt-1 text-[10px] text-zinc-400">
                  {new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }).format(new Date(n.created_at))}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-500">お知らせ</h2>
        {!announcements?.length ? (
          <Empty>お知らせはありません</Empty>
        ) : (
          <div className="space-y-2">
            {announcements.map((n) => (
              <Card key={n.id} className="!p-3">
                <p className="text-sm font-medium">{n.title}</p>
                {n.body && <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-600">{n.body}</p>}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
