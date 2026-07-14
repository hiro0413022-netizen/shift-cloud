import { requireActor } from "@/lib/auth";
import { createAdmin } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { PageTitle, Table, Td, Card, Button, Input, Label, Select, Empty } from "@/components/ui";
import { hm, dowJP, todayJST } from "@/lib/util";

export default async function EventsPage() {
  const actor = await requireActor("manage_announcements");
  const admin = createAdmin();
  const [{ data: events }, { data: stores }, { data: types }] = await Promise.all([
    admin.from("store_events").select("*, stores(name), schedule_types(name, color)")
      .eq("company_id", actor.companyId).is("deleted_at", null)
      .gte("date", todayJST()).order("date").limit(100),
    admin.from("stores").select("id, name").eq("company_id", actor.companyId).is("deleted_at", null).order("name"),
    admin.from("schedule_types").select("id, name").eq("company_id", actor.companyId).is("deleted_at", null).order("sort_order"),
  ]);

  async function save(formData: FormData) {
    "use server";
    const a = await requireActor("manage_announcements");
    const ad = createAdmin();
    const row = {
      store_id: String(formData.get("store_id")),
      schedule_type_id: String(formData.get("schedule_type_id") || "") || null,
      title: String(formData.get("title")),
      date: String(formData.get("date")),
      start_time: String(formData.get("start_time") || "") || null,
      end_time: String(formData.get("end_time") || "") || null,
      note: String(formData.get("note") || ""),
    };
    const { data } = await ad.from("store_events").insert({ ...row, company_id: a.companyId }).select("id").single();
    await logAudit(a, "store_event.create", "store_events", data?.id ?? null, null, row);
    revalidatePath("/admin/events");
  }

  async function remove(formData: FormData) {
    "use server";
    const a = await requireActor("manage_announcements");
    const ad = createAdmin();
    const id = String(formData.get("id"));
    await ad.from("store_events").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("company_id", a.companyId);
    await logAudit(a, "store_event.delete", "store_events", id);
    revalidatePath("/admin/events");
  }

  return (
    <>
      <PageTitle>店舗イベント・共有予定</PageTitle>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {!events?.length ? (
            <Empty>今後のイベントはありません</Empty>
          ) : (
            <Table headers={["日付", "店舗", "イベント", "時間", ""]}>
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-zinc-50">
                  <Td className="whitespace-nowrap">{e.date}（{dowJP(e.date)}）</Td>
                  <Td>{(e.stores as unknown as { name: string } | null)?.name}</Td>
                  <Td className="font-medium">{e.title}</Td>
                  <Td>{e.start_time ? `${hm(e.start_time)}〜${hm(e.end_time)}` : "終日"}</Td>
                  <Td>
                    <form action={remove}>
                      <input type="hidden" name="id" value={e.id} />
                      <button className="text-sm text-zinc-400 hover:text-red-600">削除</button>
                    </form>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
        <Card>
          <p className="mb-4 text-sm font-medium">イベントを追加</p>
          <form action={save} className="space-y-3">
            <div>
              <Label>店舗</Label>
              <Select name="store_id" required>
                {stores?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>タイトル</Label>
              <Input name="title" required placeholder="例: 設備点検 / VIP来店 / コンペ" />
            </div>
            <div>
              <Label>種別</Label>
              <Select name="schedule_type_id">
                <option value="">なし</option>
                {types?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>日付</Label>
              <Input name="date" type="date" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>開始</Label>
                <Input name="start_time" type="time" />
              </div>
              <div>
                <Label>終了</Label>
                <Input name="end_time" type="time" />
              </div>
            </div>
            <div>
              <Label>メモ</Label>
              <Input name="note" />
            </div>
            <Button type="submit" className="w-full">追加</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
